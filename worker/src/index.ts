import { generateCdpBearerJwt } from './cdpAuth'
import {
  getSessionById,
  getSessionByProviderRef,
  insertSession,
  markWebhookProcessed,
  recordStatusTransition,
  tryInsertWebhookEvent,
  updateSessionFields,
} from './db'
import { ALLOWED_ORIGIN, json } from './lib/response'
import { apiPublicUrl } from './lib/publicUrl'
import { nowIso } from './lib/time'
import { handleGetResource } from './routes/resource'
import { handlePostPaymentAttempt } from './routes/paymentAttempt'
import { handleGetPaymentAttemptById } from './routes/paymentAttemptById'
import { handleX402Pay } from './routes/x402Pay'
import { handleX402Verify } from './routes/x402Verify'
import type { PaymentSession, PaymentStatus } from './session'
import type { Env } from './types/env'

export type { Env } from './types/env'
export type { PaymentSession } from './session'

const SESSION_TTL_MS = 30 * 60 * 1000
const CHECKOUTS_PATH = '/api/v1/checkouts'

function newSessionId(): string {
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  return `ps_${id}`
}

function siteUrl(env: Env): string {
  return (env.SITE_URL || 'https://402.earth').replace(/\/$/, '')
}

function publicSession(session: PaymentSession) {
  return {
    sessionId: session.sessionId,
    slug: session.slug,
    label: session.label,
    amount: session.amount,
    currency: session.currency,
    paymentMethod: session.paymentMethod,
    status: session.status,
    provider: session.provider,
    providerRef: session.providerRef,
    successUrl: session.successUrl,
    cancelUrl: session.cancelUrl,
    createdAt: session.createdAt,
    paidAt: session.paidAt,
    expiresAt: session.expiresAt,
  }
}

function decidePaymentMethod(
  req: Request,
  mode: string | undefined,
): PaymentSession['paymentMethod'] {
  const m = (mode || 'auto').toLowerCase()
  if (m === 'x402') return 'x402'
  if (m === 'checkout') return 'checkout'

  const accept = req.headers.get('accept') || ''
  const jsonOnly =
    accept.includes('application/json') && !accept.includes('text/html')
  if (jsonOnly) return 'x402'

  return 'checkout'
}

async function createCoinbaseCheckout(
  env: Env,
  session: PaymentSession,
): Promise<{ checkoutUrl: string; providerRef: string } | { error: string }> {
  const keyId = env.COINBASE_CDP_API_KEY_ID?.trim()
  const keySecret = env.COINBASE_CDP_API_KEY_SECRET?.trim()
  if (!keyId || !keySecret) {
    return {
      error:
        'Checkout is not configured (missing COINBASE_CDP_API_KEY_ID / COINBASE_CDP_API_KEY_SECRET)',
    }
  }

  const token = await generateCdpBearerJwt({
    apiKeyId: keyId,
    apiKeySecret: keySecret,
    requestMethod: 'POST',
    requestHost: 'business.coinbase.com',
    requestPath: CHECKOUTS_PATH,
  })

  const origin = siteUrl(env)
  const successRedirectUrl = `${origin}/success/${encodeURIComponent(session.slug)}?sessionId=${encodeURIComponent(session.sessionId)}`
  const failRedirectUrl = `${origin}/pay/${encodeURIComponent(session.slug)}?sessionId=${encodeURIComponent(session.sessionId)}&amount=${encodeURIComponent(session.amount)}&label=${encodeURIComponent(session.label)}`

  const res = await fetch(`https://business.coinbase.com${CHECKOUTS_PATH}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-idempotency-key': session.sessionId,
    },
    body: JSON.stringify({
      amount: session.amount,
      currency: 'USDC',
      network: 'base',
      description: `${session.label} — ${session.slug}`,
      expiresAt: session.expiresAt,
      successRedirectUrl,
      failRedirectUrl,
      metadata: {
        session_id: session.sessionId,
        slug: session.slug,
      },
    }),
  })

  const payload = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null

  if (!res.ok) {
    let msg = `Coinbase Checkout error (${res.status})`
    if (payload && typeof payload.message === 'string') msg = payload.message
    else if (payload && typeof payload.error === 'string') msg = payload.error
    else if (payload && Array.isArray(payload.errors) && payload.errors[0]) {
      const first = payload.errors[0] as { message?: string }
      if (typeof first?.message === 'string') msg = first.message
    }
    return { error: msg }
  }

  const checkoutUrl = typeof payload?.url === 'string' ? payload.url : null
  const providerRef = typeof payload?.id === 'string' ? payload.id : null
  if (!checkoutUrl || !providerRef) {
    return { error: 'Unexpected Coinbase Checkout API response' }
  }

  return { checkoutUrl, providerRef }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return out === 0
}

async function verifyCommerceWebhookSignature(
  secret: string,
  body: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signatureHeader) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  const digest = [...new Uint8Array(sigBuf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return timingSafeEqualHex(
    digest.toLowerCase(),
    signatureHeader.toLowerCase(),
  )
}

async function verifyHook0WebhookSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | null,
  headers: Headers,
  maxSkewSec = 300,
): Promise<boolean> {
  if (!signatureHeader) return false
  const parts: Record<string, string> = {}
  for (const segment of signatureHeader.split(',')) {
    const eq = segment.indexOf('=')
    if (eq === -1) continue
    parts[segment.slice(0, eq).trim()] = segment.slice(eq + 1).trim()
  }
  const t = parts['t']
  const v1 = parts['v1']
  if (!t || !v1) return false
  const ts = parseInt(t, 10)
  if (Number.isNaN(ts)) return false
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - ts) > maxSkewSec) return false

  const h = parts['h']
  let signedData: string
  if (h) {
    const names = h.split(/\s+/).filter(Boolean)
    const headerValues = names.map((n) => headers.get(n) ?? '').join('.')
    signedData = `${t}.${h}.${headerValues}.${rawBody}`
  } else {
    signedData = `${t}.${rawBody}`
  }

  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(signedData))
  const expected = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return timingSafeEqualHex(expected.toLowerCase(), v1.toLowerCase())
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  )
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function extractWebhookEventType(parsed: unknown): string {
  if (!parsed || typeof parsed !== 'object') return ''
  const o = parsed as Record<string, unknown>
  if (typeof o.eventType === 'string') return o.eventType
  if (typeof o.type === 'string') return o.type
  const ev = o.event
  if (ev && typeof ev === 'object') {
    const t = (ev as Record<string, unknown>).type
    if (typeof t === 'string') return t
  }
  return ''
}

function extractSessionIdFromPayload(parsed: unknown): string | null {
  const walk = (node: unknown): string | null => {
    if (!node || typeof node !== 'object') return null
    const o = node as Record<string, unknown>
    const meta = o.metadata
    if (meta && typeof meta === 'object') {
      const m = meta as Record<string, unknown>
      const a = m.session_id
      const b = m.sessionId
      if (typeof a === 'string' && a) return a
      if (typeof b === 'string' && b) return b
    }
    for (const v of Object.values(o)) {
      const found = walk(v)
      if (found) return found
    }
    return null
  }
  return walk(parsed)
}

function extractProviderRefFromPayload(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object') return null
  const o = parsed as Record<string, unknown>
  const ev = o.event
  if (ev && typeof ev === 'object') {
    const data = (ev as Record<string, unknown>).data
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>
      if (typeof d.code === 'string') return d.code
      if (typeof d.id === 'string') return d.id
    }
  }
  const data = o.data
  if (data && typeof data === 'object') {
    const id = (data as Record<string, unknown>).id
    if (typeof id === 'string') return id
  }
  const checkout = o.checkout
  if (checkout && typeof checkout === 'object') {
    const id = (checkout as Record<string, unknown>).id
    if (typeof id === 'string') return id
  }
  return null
}

function mapWebhookEventToStatus(
  eventType: string,
): PaymentStatus | null {
  const t = eventType.toLowerCase()
  if (
    t.includes('checkout.payment.success') ||
    t === 'charge:confirmed' ||
    t === 'charge:resolved'
  ) {
    return 'paid'
  }
  if (t.includes('checkout.payment.failed') || t === 'charge:failed') {
    return 'failed'
  }
  if (t.includes('checkout.payment.expired') || t === 'charge:expired') {
    return 'expired'
  }
  if (t.includes('cancel')) return 'cancelled'
  if (t.includes('checkout.payment.pending') || t === 'charge:pending') {
    return 'pending'
  }
  return null
}

async function ensureSessionExpiry(
  db: D1Database,
  session: PaymentSession,
): Promise<PaymentSession> {
  if (
    session.status === 'paid' ||
    session.status === 'failed' ||
    session.status === 'expired' ||
    session.status === 'cancelled'
  ) {
    return session
  }
  if (new Date(session.expiresAt).getTime() > Date.now()) return session

  const now = nowIso()
  const prev = session.status
  await updateSessionFields(db, session.sessionId, { status: 'expired' }, now)
  await recordStatusTransition(
    db,
    session.sessionId,
    prev,
    'expired',
    'session TTL',
    'worker',
    now,
  )
  session.status = 'expired'
  return session
}

async function applyWebhookSessionUpdate(
  db: D1Database,
  session: PaymentSession,
  next: PaymentStatus,
  eventType: string,
): Promise<void> {
  if (session.status === 'expired' || session.status === 'cancelled') return
  if (session.status === 'paid' && next !== 'paid') return

  const prev = session.status
  if (prev === next) return

  const now = nowIso()
  const patch: {
    status: PaymentStatus
    paidAt?: string | null
  } = { status: next }
  if (next === 'paid') patch.paidAt = now

  await updateSessionFields(db, session.sessionId, patch, now)
  await recordStatusTransition(
    db,
    session.sessionId,
    prev,
    next,
    eventType,
    'webhook',
    now,
  )
  session.status = next
  if (next === 'paid') session.paidAt = now
}

/** v2 session-based x402 URL (`?sessionId=`); kept for existing clients. */
async function handleLegacyX402PaySession(
  env: Env,
  slug: string,
  sessionId: string,
): Promise<Response> {
  const session = await getSessionById(env.DB, sessionId)
  if (!session || session.slug !== slug) {
    return json({ error: 'Unknown session', x402: true }, { status: 404 })
  }

  await ensureSessionExpiry(env.DB, session)

  if (session.status === 'paid') {
    return json({
      ok: true,
      slug: session.slug,
      sessionId: session.sessionId,
      paidAt: session.paidAt,
      resource: { message: 'Payment satisfied for this session.' },
    })
  }

  return json(
    {
      x402: true,
      status: 'payment_required',
      sessionId: session.sessionId,
      slug: session.slug,
      amount: session.amount,
      currency: session.currency,
      label: session.label,
      hint: 'Complete payment per x402, then retry this URL with proof headers (verify endpoint).',
    },
    { status: 402 },
  )
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': ALLOWED_ORIGIN,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type, x-402-client',
        },
      })
    }

    const resourceGet =
      req.method === 'GET' && /^\/api\/resource\/([^/]+)$/.exec(url.pathname)
    if (resourceGet) {
      const slug = decodeURIComponent(resourceGet[1])
      return handleGetResource(env, slug)
    }

    if (req.method === 'POST' && url.pathname === '/api/payment-attempt') {
      return handlePostPaymentAttempt(env, req)
    }

    const paymentAttemptGet =
      req.method === 'GET' &&
      /^\/api\/payment-attempt\/([^/]+)$/.exec(url.pathname)
    if (paymentAttemptGet) {
      const id = paymentAttemptGet[1]
      return handleGetPaymentAttemptById(env, id)
    }

    const paymentSessionGet =
      req.method === 'GET' &&
      /^\/api\/payment-session\/([^/]+)$/.exec(url.pathname)
    if (paymentSessionGet) {
      const id = paymentSessionGet[1]
      const session = await getSessionById(env.DB, id)
      if (!session) {
        return json({ ok: false, error: 'Session not found' }, { status: 404 })
      }
      await ensureSessionExpiry(env.DB, session)
      return json({ ok: true, session: publicSession(session) })
    }

    if (req.method === 'POST' && url.pathname === '/api/payment-session') {
      const body = (await req.json().catch(() => null)) as
        | {
            slug?: string
            amount?: string
            label?: string
            mode?: string
          }
        | null

      const slug = body?.slug?.trim()
      const label = body?.label?.trim() || 'Payment'
      const amountNum = Number(body?.amount)

      if (!slug || Number.isNaN(amountNum) || amountNum <= 0) {
        return json(
          { ok: false, error: 'Invalid payment request' },
          { status: 400 },
        )
      }

      const amount = amountNum.toFixed(2)
      const paymentMethod = decidePaymentMethod(req, body?.mode)
      const sessionId = newSessionId()
      const createdAt = nowIso()
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
      const successUrl = `/success/${slug}?sessionId=${sessionId}`
      const cancelUrl = `/pay/${slug}?sessionId=${sessionId}`

      const session: PaymentSession = {
        sessionId,
        slug,
        label,
        amount,
        currency: 'USDC',
        paymentMethod,
        status: 'created',
        provider: null,
        providerRef: null,
        successUrl,
        cancelUrl,
        createdAt,
        paidAt: null,
        expiresAt,
      }

      if (paymentMethod === 'x402') {
        session.status = 'payment_required'
        session.provider = null
        const base = apiPublicUrl(env, req)
        const resourceUrl = `${base}/x402/pay/${encodeURIComponent(slug)}?sessionId=${encodeURIComponent(sessionId)}`
        await insertSession(env.DB, session, null, resourceUrl)
        return json({
          ok: true,
          sessionId,
          status: session.status,
          paymentMethod: 'x402',
          resourceUrl,
        })
      }

      session.provider = 'coinbase_checkout'
      await insertSession(env.DB, session, null, null)

      const checkout = await createCoinbaseCheckout(env, session)
      if ('error' in checkout) {
        const now = nowIso()
        await updateSessionFields(
          env.DB,
          session.sessionId,
          { status: 'failed' },
          now,
        )
        await recordStatusTransition(
          env.DB,
          session.sessionId,
          session.status,
          'failed',
          checkout.error,
          'checkout_create',
          now,
        )
        session.status = 'failed'
        return json(
          {
            ok: false,
            error: checkout.error,
            sessionId,
            status: session.status,
          },
          { status: 503 },
        )
      }

      const now = nowIso()
      session.providerRef = checkout.providerRef
      session.status = 'payment_required'
      await updateSessionFields(
        env.DB,
        session.sessionId,
        {
          status: 'payment_required',
          providerRef: checkout.providerRef,
          checkoutUrl: checkout.checkoutUrl,
        },
        now,
      )
      await recordStatusTransition(
        env.DB,
        session.sessionId,
        'created',
        'payment_required',
        'checkout created',
        'checkout_create',
        now,
      )

      return json({
        ok: true,
        sessionId,
        status: session.status,
        paymentMethod: 'checkout',
        checkoutUrl: checkout.checkoutUrl,
        successUrl: session.successUrl,
        expiresAt: session.expiresAt,
      })
    }

    if (
      req.method === 'POST' &&
      url.pathname === '/api/webhooks/coinbase-business'
    ) {
      const raw = await req.text()
      const secret = env.COINBASE_WEBHOOK_SHARED_SECRET?.trim()
      if (!secret) {
        return json({ ok: false, error: 'Webhook not configured' }, { status: 503 })
      }

      const hookSig = req.headers.get('x-hook0-signature')
      const ccSig = req.headers.get('x-cc-webhook-signature')
      let verified = false
      if (hookSig) {
        verified = await verifyHook0WebhookSignature(secret, raw, hookSig, req.headers)
      } else if (ccSig) {
        verified = await verifyCommerceWebhookSignature(secret, raw, ccSig)
      } else {
        return json({ ok: false, error: 'Missing signature' }, { status: 401 })
      }

      if (!verified) {
        return json({ ok: false, error: 'Invalid signature' }, { status: 401 })
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(raw) as unknown
      } catch {
        return json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
      }

      const eventType = extractWebhookEventType(parsed)
      const sessionIdMeta = extractSessionIdFromPayload(parsed)
      const providerRef = extractProviderRefFromPayload(parsed)

      const hookId = req.headers.get('x-hook0-id')?.trim()
      const providerEventId =
        hookId ||
        `legacy_${(await sha256Hex(`${eventType}:${raw}`)).slice(0, 48)}`

      const isCommerceCharge =
        Boolean(ccSig) && eventType.toLowerCase().startsWith('charge:')
      const providerKind = isCommerceCharge
        ? 'coinbase_commerce'
        : 'coinbase_checkout'

      const insertResult = await tryInsertWebhookEvent(env.DB, {
        provider: providerKind,
        providerEventId,
        providerRef,
        sessionId: sessionIdMeta,
        eventType: eventType || 'unknown',
        payloadJson: raw,
        receivedAt: nowIso(),
      })

      if (insertResult === 'duplicate') {
        return json({ ok: true, deduped: true })
      }

      const nextStatus = mapWebhookEventToStatus(eventType)
      let session: PaymentSession | null = null
      if (sessionIdMeta) {
        session = await getSessionById(env.DB, sessionIdMeta)
      }
      if (!session && providerRef) {
        session = await getSessionByProviderRef(env.DB, providerRef)
      }

      if (session && nextStatus) {
        await applyWebhookSessionUpdate(env.DB, session, nextStatus, eventType)
      }

      await markWebhookProcessed(env.DB, providerKind, providerEventId, nowIso())

      return json({ ok: true })
    }

    const x402Pay =
      req.method === 'GET' && /^\/x402\/pay\/([^/]+)$/.exec(url.pathname)
    if (x402Pay) {
      const slug = decodeURIComponent(x402Pay[1])
      const attemptId = url.searchParams.get('attemptId')?.trim()
      const sessionId = url.searchParams.get('sessionId')?.trim()
      if (sessionId && !attemptId) {
        return handleLegacyX402PaySession(env, slug, sessionId)
      }
      return handleX402Pay(env, slug, url)
    }

    if (req.method === 'POST' && url.pathname === '/x402/verify') {
      return handleX402Verify(env, req)
    }

    return json({ ok: false, error: 'Not found' }, { status: 404 })
  },
}
