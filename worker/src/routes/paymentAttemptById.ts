import {
  getAttemptById,
  markAttemptPaidIfUnpaid,
  txHashClaimedByOtherPaidAttempt,
} from '../db/attempts'
import { insertPaymentEvent } from '../db/events'
import {
  findAutoUsdcTransferOnBase,
  mockVerifyEnabled,
  parseUsdcMinorUnits,
} from '../lib/facilitator'
import { sha256HexUtf8 } from '../lib/hash'
import { createEventId } from '../lib/ids'
import { json, notFound } from '../lib/response'
import { nowIso } from '../lib/time'
import type { Env } from '../types/env'
import type { PaymentAttempt, PaymentAttemptStatus } from '../types/payment'

const AUTO_VERIFY_SOURCE = 'auto_chain_scan'

function publicAttempt(attempt: PaymentAttempt, env: Env) {
  const recv = env.PAYMENT_RECEIVER_ADDRESS?.trim() || null
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
    paymentReceiverAddress: recv,
  }
}

function terminalUnpaid(status: PaymentAttemptStatus): boolean {
  return status === 'failed' || status === 'expired' || status === 'cancelled'
}

function eligibleForAutoChainVerify(attempt: PaymentAttempt): boolean {
  if (attempt.status === 'paid') return false
  if (terminalUnpaid(attempt.status)) return false
  if (attempt.currency.toUpperCase() !== 'USDC') return false
  if (attempt.network.toLowerCase() !== 'base') return false
  return true
}

export async function handleGetPaymentAttemptById(
  env: Env,
  id: string,
): Promise<Response> {
  let attempt = await getAttemptById(env.DB, id)
  if (!attempt) {
    return notFound('Attempt not found')
  }

  if (
    !mockVerifyEnabled(env) &&
    eligibleForAutoChainVerify(attempt) &&
    env.BASE_RPC_URL?.trim() &&
    env.PAYMENT_RECEIVER_ADDRESS?.trim()
  ) {
    const expectedMinor = parseUsdcMinorUnits(attempt.amount)
    if (expectedMinor !== null) {
      const attemptId = attempt.id
      try {
        const match = await findAutoUsdcTransferOnBase(env, {
          receiverAddress: env.PAYMENT_RECEIVER_ADDRESS.trim(),
          minimumAmountMinor: expectedMinor,
          attemptCreatedAtIso: attempt.createdAt,
          allowTxHash: async (txHash) => {
            const claimed = await txHashClaimedByOtherPaidAttempt(
              env.DB,
              txHash,
              attemptId,
            )
            return !claimed
          },
        })

        if (match) {
          const t = nowIso()
          const paymentSignatureHash = await sha256HexUtf8(
            `auto:${match.txHash.toLowerCase()}`,
          )
          const didMark = await markAttemptPaidIfUnpaid(env.DB, attempt.id, t, t, {
            payerAddress: match.payerAddress,
            paymentSignatureHash,
            txHash: match.txHash,
          })
          if (didMark) {
            await insertPaymentEvent(env.DB, {
              id: createEventId(),
              attemptId: attempt.id,
              eventType: 'verification_succeeded',
              source: AUTO_VERIFY_SOURCE,
              payloadJson: JSON.stringify({
                payerAddress: match.payerAddress,
                txHash: match.txHash,
                paymentSignatureHash,
                network: 'base',
              }),
              createdAt: t,
            })
          }
        }
      } catch {
        // RPC/DB constraint races: leave attempt unchanged; next poll retries.
      }
    }
    attempt = (await getAttemptById(env.DB, id)) ?? attempt
  }

  return json({ ok: true, attempt: publicAttempt(attempt, env) })
}
