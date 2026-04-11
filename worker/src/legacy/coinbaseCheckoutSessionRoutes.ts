/**
 * Legacy Coinbase-hosted checkout + v2 session APIs (not the primary x402-native path).
 * Routes: GET/POST /api/payment-session, POST /api/webhooks/coinbase-business,
 * and session-based GET /x402/pay/:slug?sessionId= (handled via handleLegacyX402PaySession).
 */
import { json } from '../lib/response'
import { apiPublicUrl } from '../lib/publicUrl'
import { nowIso } from '../lib/time'
import type { Env } from '../types/env'
import {
  applyWebhookSessionUpdate,
  createCoinbaseCheckout,
  decidePaymentMethod,
  ensureSessionExpiry,
  extractProviderRefFromPayload,
  extractSessionIdFromPayload,
  extractWebhookEventType,
  mapWebhookEventToStatus,
  newSessionId,
  publicSession,
  sha256Hex,
  verifyCommerceWebhookSignature,
  verifyHook0WebhookSignature,
} from './coinbaseCheckoutSessionInternals'
import {
  getSessionById,
  getSessionByProviderRef,
  insertSession,
  markWebhookProcessed,
  recordStatusTransition,
  tryInsertWebhookEvent,
  updateSessionFields,
} from './paymentSessionDb'
import type { PaymentSession } from './paymentSessionTypes'

export { handleLegacyX402PaySession } from './coinbaseCheckoutSessionInternals'

const SESSION_TTL_MS = 30 * 60 * 1000

/** Coinbase checkout + webhook + legacy payment session HTTP handlers. */
export async function tryLegacyCoinbaseCheckoutRoutes(
  env: Env,
  req: Request,
  url: URL,
): Promise<Response | null> {
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

  return null
}
