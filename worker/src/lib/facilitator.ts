import type { Env } from '../types/env'
import type { PaymentAttempt } from '../types/payment'

/** Outcome of x402 payment proof verification (facilitator or mock). */
export type VerificationResult =
  | {
      ok: true
      /** Settled payer identity when known (mock uses a deterministic placeholder). */
      payerAddress: string
      /** On-chain or facilitator settlement reference when known. */
      txHash: string
    }
  | {
      ok: false
      error: string
      /** Machine-readable reason for routing / metrics. */
      code?: string
    }

/** Inputs for facilitator verification; stable contract for swapping implementations. */
export type FacilitatorVerifyInput = {
  attempt: PaymentAttempt
  slug: string
  paymentSignature: string
  /** SHA-256 hex of `paymentSignature` (UTF-8); precomputed by the route. */
  paymentSignatureHash: string
}

function mockVerifyEnabled(env: Env): boolean {
  const v = env.X402_MOCK_VERIFY?.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

/**
 * Verify an x402 payment proof via the configured facilitator.
 * Today: mock success when `X402_MOCK_VERIFY` is truthy; otherwise not configured.
 * Later: replace the non-mock branch with a real facilitator HTTP/SDK call using the same input shape.
 */
export async function verifyWithFacilitator(
  env: Env,
  input: FacilitatorVerifyInput,
): Promise<VerificationResult> {
  if (mockVerifyEnabled(env)) {
    const h = input.paymentSignatureHash
    return {
      ok: true,
      payerAddress: `0x${h.slice(0, 40).padEnd(40, '0')}`,
      txHash: `0x${h.slice(0, 64).padEnd(64, '0')}`,
    }
  }

  return {
    ok: false,
    error:
      'Real x402 facilitator is not configured. Set X402_MOCK_VERIFY=true for local mock verification only.',
    code: 'FACILITATOR_NOT_CONFIGURED',
  }
}
