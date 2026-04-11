import { json } from '../lib/response'
import { nowIso } from '../lib/time'
import type { Env } from '../types/env'
import { generateCdpBearerJwt } from './cdpAuth'
import {
  getSessionById,
  recordStatusTransition,
  updateSessionFields,
} from './paymentSessionDb'
import type { PaymentSession, PaymentStatus } from './paymentSessionTypes'

const CHECKOUTS_PATH = '/api/v1/checkouts'

export function siteUrl(env: Env): string {
  return (env.SITE_URL || 'https://402.earth').replace(/\/$/, '')
}

export function newSessionId(): string {
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  return `ps_${id}`
}

export function publicSession(session: PaymentSession) {
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

export function decidePaymentMethod(
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

export async function createCoinbaseCheckout(
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

export async function verifyCommerceWebhookSignature(
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

export async function verifyHook0WebhookSignature(
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

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  )
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function extractWebhookEventType(parsed: unknown): string {
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

export function extractSessionIdFromPayload(parsed: unknown): string | null {
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

export function extractProviderRefFromPayload(parsed: unknown): string | null {
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

export function mapWebhookEventToStatus(eventType: string): PaymentStatus | null {
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

export async function ensureSessionExpiry(
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

export async function applyWebhookSessionUpdate(
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

/** v2 session-based x402 URL (`?sessionId=`); not the v3 `attemptId` flow. */
export async function handleLegacyX402PaySession(
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
