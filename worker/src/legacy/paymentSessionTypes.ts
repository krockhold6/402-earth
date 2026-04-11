/**
 * Legacy Coinbase checkout + v2 x402 session model (`payment_sessions` D1 table).
 * Worker v3 uses payment attempts; keep these types for backwards-compatible routes only.
 */
export type PaymentStatus =
  | 'created'
  | 'payment_required'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled'

export type PaymentMethod = 'checkout' | 'x402'

export interface PaymentSession {
  sessionId: string
  slug: string
  label: string
  amount: string
  currency: string
  paymentMethod: PaymentMethod
  status: PaymentStatus
  provider: 'coinbase_checkout' | 'coinbase_commerce' | null
  providerRef: string | null
  successUrl: string
  cancelUrl: string
  createdAt: string
  paidAt: string | null
  expiresAt: string
  payerWallet?: string
  chain?: string
  txHash?: string
}
