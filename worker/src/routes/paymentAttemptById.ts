import { getAttemptById } from '../db/attempts'
import { json, notFound } from '../lib/response'
import type { Env } from '../types/env'
import type { PaymentAttempt } from '../types/payment'

function publicAttempt(attempt: PaymentAttempt) {
  return {
    id: attempt.id,
    slug: attempt.slug,
    label: attempt.label,
    amount: attempt.amount,
    currency: attempt.currency,
    network: attempt.network,
    status: attempt.status,
    clientType: attempt.clientType,
    paymentMethod: attempt.paymentMethod,
    payerAddress: attempt.payerAddress,
    paymentSignatureHash: attempt.paymentSignatureHash,
    txHash: attempt.txHash,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
    paidAt: attempt.paidAt,
    expiresAt: attempt.expiresAt,
  }
}

export async function handleGetPaymentAttemptById(
  env: Env,
  id: string,
): Promise<Response> {
  const attempt = await getAttemptById(env.DB, id)
  if (!attempt) {
    return notFound('Attempt not found')
  }
  return json({ ok: true, attempt: publicAttempt(attempt) })
}
