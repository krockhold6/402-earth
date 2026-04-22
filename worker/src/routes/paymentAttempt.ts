import { createAttempt } from '../db/attempts'
import { insertPaymentEvent } from '../db/events'
import { getResourceBySlug } from '../db/resources'
import { evaluateCapabilityPolicyForBuyerPeek } from '../lib/capabilityPolicy'
import { sha256HexUtf8 } from '../lib/hash'
import { createAttemptId, createEventId } from '../lib/ids'
import { parseUsdcMinorUnits } from '../lib/facilitator'
import { apiPublicUrl } from '../lib/publicUrl'
import { badRequest, json, notFound } from '../lib/response'
import { nowIso } from '../lib/time'
import type { PaymentClientType } from '../types/payment'
import type { Env } from '../types/env'

const FREE_UNLOCK_SOURCE = 'free_zero_amount'

function parseClientType(raw: unknown): PaymentClientType {
  if (typeof raw !== 'string') return 'browser'
  const t = raw.toLowerCase()
  if (t === 'browser' || t === 'agent' || t === 'api') return t
  return 'browser'
}

export async function handlePostPaymentAttempt(
  env: Env,
  req: Request,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as
    | { slug?: string; clientType?: string }
    | null

  const slug = body?.slug?.trim()
  if (!slug) {
    return badRequest('slug required')
  }

  const clientType = parseClientType(body?.clientType)
  const resource = await getResourceBySlug(env.DB, slug)
  if (!resource || !resource.active) {
    return notFound('Resource not found')
  }

  if (resource.sellType === 'capability') {
    const lc = resource.capabilityLifecycle ?? 'active'
    if (lc === 'disabled') {
      return json(
        {
          ok: false,
          error: 'This capability is disabled and cannot accept new payments.',
          code: 'CAPABILITY_DISABLED',
        },
        { status: 409 },
      )
    }
    if (lc === 'archived') {
      return json(
        {
          ok: false,
          error: 'This capability is archived and cannot accept new payments.',
          code: 'CAPABILITY_ARCHIVED',
        },
        { status: 409 },
      )
    }
    const peek = await evaluateCapabilityPolicyForBuyerPeek(env, resource)
    if (!peek.ok) {
      return json(
        {
          ok: false,
          error: peek.publicMessage,
          code: peek.code,
        },
        { status: peek.httpStatus },
      )
    }
  }

  const attemptId = createAttemptId()
  const t = nowIso()
  const base = env.API_PUBLIC_URL?.replace(/\/$/, '') ?? apiPublicUrl(env, req)
  const resourceUrl = `${base}/x402/pay/${encodeURIComponent(slug)}?attemptId=${encodeURIComponent(attemptId)}`

  const amountMinor = parseUsdcMinorUnits(resource.amount)
  const isFreeUsdc =
    amountMinor !== null && amountMinor === 0n && resource.currency.toUpperCase() === 'USDC'

  if (isFreeUsdc) {
    const paymentSignatureHash = await sha256HexUtf8(
      `free:${attemptId}:${resource.slug}`,
    )
    await createAttempt(env.DB, {
      id: attemptId,
      slug: resource.slug,
      label: resource.label,
      amount: resource.amount,
      currency: resource.currency,
      network: resource.network,
      receiverAddress: resource.receiverAddress,
      status: 'paid',
      clientType,
      paymentMethod: 'x402',
      payerAddress: null,
      paymentSignatureHash,
      txHash: null,
      createdAt: t,
      updatedAt: t,
      paidAt: t,
    })
    await insertPaymentEvent(env.DB, {
      id: createEventId(),
      attemptId,
      eventType: 'verification_succeeded',
      source: FREE_UNLOCK_SOURCE,
      payloadJson: JSON.stringify({
        reason: 'zero_usdc_amount',
        slug: resource.slug,
        paymentSignatureHash,
      }),
      createdAt: t,
    })

    return json({
      ok: true,
      attemptId,
      status: 'paid' as const,
      resourceUrl,
      receiverAddress: resource.receiverAddress,
    })
  }

  await createAttempt(env.DB, {
    id: attemptId,
    slug: resource.slug,
    label: resource.label,
    amount: resource.amount,
    currency: resource.currency,
    network: resource.network,
    receiverAddress: resource.receiverAddress,
    status: 'payment_required',
    clientType,
    paymentMethod: 'x402',
    createdAt: t,
    updatedAt: t,
  })

  return json({
    ok: true,
    attemptId,
    status: 'payment_required' as const,
    resourceUrl,
    receiverAddress: resource.receiverAddress,
  })
}
