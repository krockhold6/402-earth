import { getAttemptById, markAttemptPaid, updateAttemptStatus } from '../db/attempts'
import { insertPaymentEvent } from '../db/events'
import { verifyWithFacilitator } from '../lib/facilitator'
import { sha256HexUtf8 } from '../lib/hash'
import { createEventId } from '../lib/ids'
import { badRequest, json, notFound } from '../lib/response'
import { nowIso } from '../lib/time'
import type { Env } from '../types/env'
import type { PaymentAttemptStatus } from '../types/payment'

const VERIFY_SOURCE = 'x402_verify'

function terminalUnpaid(status: PaymentAttemptStatus): boolean {
  return status === 'failed' || status === 'expired' || status === 'cancelled'
}

export async function handleX402Verify(
  env: Env,
  req: Request,
): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('Invalid JSON body')
  }

  const o = body as Record<string, unknown>
  const attemptId =
    typeof o.attemptId === 'string' ? o.attemptId.trim() : ''
  const slug = typeof o.slug === 'string' ? o.slug.trim() : ''
  const paymentSignature =
    typeof o.paymentSignature === 'string' ? o.paymentSignature : ''

  if (!attemptId) return badRequest('attemptId is required')
  if (!slug) return badRequest('slug is required')
  if (!paymentSignature.trim()) {
    return badRequest('paymentSignature is required (use a placeholder string in mock mode)')
  }

  const attempt = await getAttemptById(env.DB, attemptId)
  if (!attempt) {
    return notFound('Attempt not found')
  }
  if (attempt.slug !== slug) {
    return badRequest('slug does not match this attempt')
  }

  if (attempt.status === 'paid') {
    return json({
      ok: true,
      status: 'paid' as const,
      attemptId: attempt.id,
      idempotent: true,
    })
  }

  if (terminalUnpaid(attempt.status)) {
    const t = nowIso()
    await insertPaymentEvent(env.DB, {
      id: createEventId(),
      attemptId: attempt.id,
      eventType: 'verification_rejected',
      source: VERIFY_SOURCE,
      payloadJson: JSON.stringify({
        reason: 'terminal_status',
        status: attempt.status,
      }),
      createdAt: t,
    })
    return json(
      {
        ok: false,
        error: `Cannot verify: attempt is ${attempt.status}`,
        attemptId: attempt.id,
      },
      { status: 409 },
    )
  }

  const paymentSignatureHash = await sha256HexUtf8(paymentSignature)
  const verifyResult = await verifyWithFacilitator(env, {
    attempt,
    slug,
    paymentSignature,
    paymentSignatureHash,
  })

  const t = nowIso()

  if (!verifyResult.ok) {
    const payload = {
      error: verifyResult.error,
      code: verifyResult.code ?? null,
      attemptId: attempt.id,
    }
    await insertPaymentEvent(env.DB, {
      id: createEventId(),
      attemptId: attempt.id,
      eventType: 'verification_failed',
      source: VERIFY_SOURCE,
      payloadJson: JSON.stringify(payload),
      createdAt: t,
    })

    if (verifyResult.code === 'FACILITATOR_NOT_CONFIGURED') {
      return json({ ok: false, ...payload }, { status: 503 })
    }

    await updateAttemptStatus(env.DB, attempt.id, 'failed', t)
    return json({ ok: false, ...payload }, { status: 400 })
  }

  await markAttemptPaid(env.DB, attempt.id, t, t, {
    payerAddress: verifyResult.payerAddress,
    paymentSignatureHash,
    txHash: verifyResult.txHash,
  })

  await insertPaymentEvent(env.DB, {
    id: createEventId(),
    attemptId: attempt.id,
    eventType: 'verification_succeeded',
    source: VERIFY_SOURCE,
    payloadJson: JSON.stringify({
      payerAddress: verifyResult.payerAddress,
      txHash: verifyResult.txHash,
      paymentSignatureHash,
      mock: true,
    }),
    createdAt: t,
  })

  return json({
    ok: true,
    status: 'paid' as const,
    attemptId: attempt.id,
  })
}
