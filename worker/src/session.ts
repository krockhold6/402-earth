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
