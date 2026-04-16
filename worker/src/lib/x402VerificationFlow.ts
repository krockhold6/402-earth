import {
  getAttemptById,
  markAttemptPaidIfUnpaid,
  updateAttemptStatus,
} from '../db/attempts'
import { insertPaymentEvent } from '../db/events'
import { mockVerifyEnabled, verifyWithFacilitator } from '../lib/facilitator'
import { sha256HexUtf8 } from '../lib/hash'
import { createEventId } from '../lib/ids'
import { nowIso } from '../lib/time'
import type { Env } from '../types/env'
import type { PaymentAttempt, PaymentAttemptStatus } from '../types/payment'

export type VerifySettleResult =
  | {
      kind: 'paid_idempotent'
      attemptId: string
    }
  | {
      kind: 'settled'
      attemptId: string
    }
  | {
      kind: 'error'
      httpStatus: number
      payload: Record<string, unknown>
    }

function terminalUnpaid(status: PaymentAttemptStatus): boolean {
  return status === 'failed' || status === 'expired' || status === 'cancelled'
}

/**
 * Shared x402 verification + D1 settlement (used by POST /x402/verify and GET /x402/pay with PAYMENT-SIGNATURE).
 */
export async function verifyAndSettlePaymentAttempt(
  env: Env,
  input: {
    attempt: PaymentAttempt
    slug: string
    paymentSignature: string
    txHash: string | undefined
    source: string
  },
): Promise<VerifySettleResult> {
  const { attempt, slug, source } = input
  const paymentSignature = input.paymentSignature
  const txHashRaw = input.txHash?.trim() ?? ''
  const useMock = mockVerifyEnabled(env)

  if (attempt.status === 'paid') {
    return { kind: 'paid_idempotent', attemptId: attempt.id }
  }

  if (terminalUnpaid(attempt.status)) {
    const t = nowIso()
    await insertPaymentEvent(env.DB, {
      id: createEventId(),
      attemptId: attempt.id,
      eventType: 'verification_rejected',
      source,
      payloadJson: JSON.stringify({
        reason: 'terminal_status',
        status: attempt.status,
      }),
      createdAt: t,
    })
    return {
      kind: 'error',
      httpStatus: 409,
      payload: {
        ok: false,
        error: `Cannot verify: attempt is ${attempt.status}`,
        code: 'ATTEMPT_TERMINAL',
        attemptId: attempt.id,
      },
    }
  }

  if (useMock && !paymentSignature.trim()) {
    return {
      kind: 'error',
      httpStatus: 400,
      payload: {
        ok: false,
        error:
          'paymentSignature is required in PAYMENT-SIGNATURE for mock verification (X402_MOCK_VERIFY)',
        code: 'SIGNATURE_REQUIRED',
        attemptId: attempt.id,
      },
    }
  }

  if (!useMock && !txHashRaw) {
    return {
      kind: 'error',
      httpStatus: 400,
      payload: {
        ok: false,
        error:
          'This server expects verifiable on-chain payment proof. Include txHash in PAYMENT-SIGNATURE (JSON or base64 JSON), use POST /x402/verify, or complete payment via the browser flow.',
        code: 'VERIFIABLE_PROOF_REQUIRED',
        attemptId: attempt.id,
      },
    }
  }

  const sigForHash = paymentSignature.trim() || txHashRaw
  const paymentSignatureHash = await sha256HexUtf8(sigForHash)
  const verifyResult = await verifyWithFacilitator(env, {
    attempt,
    slug,
    paymentSignature,
    paymentSignatureHash,
    txHash: txHashRaw || undefined,
  })

  const t = nowIso()

  if (!verifyResult.ok) {
    const latestBeforeFail = await getAttemptById(env.DB, attempt.id)
    if (latestBeforeFail?.status === 'paid') {
      return { kind: 'paid_idempotent', attemptId: attempt.id }
    }

    const payload = {
      ok: false,
      error: verifyResult.error,
      code: verifyResult.code ?? null,
      attemptId: attempt.id,
    }
    await insertPaymentEvent(env.DB, {
      id: createEventId(),
      attemptId: attempt.id,
      eventType: 'verification_failed',
      source,
      payloadJson: JSON.stringify(payload),
      createdAt: t,
    })

    if (verifyResult.code === 'FACILITATOR_NOT_CONFIGURED') {
      return { kind: 'error', httpStatus: 503, payload }
    }

    await updateAttemptStatus(env.DB, attempt.id, 'failed', t)
    return { kind: 'error', httpStatus: 400, payload }
  }

  const marked = await markAttemptPaidIfUnpaid(env.DB, attempt.id, t, t, {
    payerAddress: verifyResult.payerAddress,
    paymentSignatureHash,
    txHash: verifyResult.txHash,
  })

  if (!marked) {
    const latest = await getAttemptById(env.DB, attempt.id)
    if (latest?.status === 'paid') {
      return { kind: 'paid_idempotent', attemptId: attempt.id }
    }
    return {
      kind: 'error',
      httpStatus: 500,
      payload: {
        ok: false,
        error: 'Verification succeeded but payment state could not be updated',
        code: 'SETTLE_FAILED',
        attemptId: attempt.id,
      },
    }
  }

  await insertPaymentEvent(env.DB, {
    id: createEventId(),
    attemptId: attempt.id,
    eventType: 'verification_succeeded',
    source,
    payloadJson: JSON.stringify({
      payerAddress: verifyResult.payerAddress,
      txHash: verifyResult.txHash,
      paymentSignatureHash,
      mock: useMock,
      network: verifyResult.network,
    }),
    createdAt: t,
  })

  return { kind: 'settled', attemptId: attempt.id }
}
