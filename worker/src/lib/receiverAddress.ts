import type { PaymentAttempt } from '../types/payment'

/** Placeholder from migration 0004 for rows created before per-resource receivers. */
export const LEGACY_PLACEHOLDER_RECEIVER =
  '0x0000000000000000000000000000000000000000'

function norm40(hex: string): string {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex
  return h.slice(-40).toLowerCase()
}

/**
 * Expected USDC recipient for an attempt: per-attempt `receiver_address`, or global env for legacy rows.
 */
export function resolveExpectedReceiver(
  attempt: Pick<PaymentAttempt, 'receiverAddress'>,
  env: { PAYMENT_RECEIVER_ADDRESS?: string },
): string | null {
  const a = attempt.receiverAddress?.trim()
  if (a && norm40(a) !== norm40(LEGACY_PLACEHOLDER_RECEIVER)) {
    return a.toLowerCase()
  }
  const g = env.PAYMENT_RECEIVER_ADDRESS?.trim()
  return g || null
}

export type ParseReceiverAddressResult =
  | { ok: true; value: string }
  | { ok: false; message: string }

/**
 * Validate EVM-style receiver for resource creation: required, 0x + 40 hex, lowercase for storage.
 */
export function parseReceiverAddressForResource(
  raw: unknown,
): ParseReceiverAddressResult {
  if (typeof raw !== 'string') {
    return { ok: false, message: 'receiverAddress is required' }
  }
  const t = raw.trim()
  if (!t) {
    return { ok: false, message: 'receiverAddress is required' }
  }
  if (!t.startsWith('0x')) {
    return { ok: false, message: 'receiverAddress must start with 0x' }
  }
  if (t.length !== 42) {
    return { ok: false, message: 'receiverAddress must be 42 characters' }
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(t)) {
    return { ok: false, message: 'receiverAddress must be 40 hex digits' }
  }
  const lower = t.toLowerCase()
  if (lower === LEGACY_PLACEHOLDER_RECEIVER) {
    return { ok: false, message: 'receiverAddress must not be the zero address' }
  }
  return { ok: true, value: lower }
}
