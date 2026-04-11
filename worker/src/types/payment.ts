/** Lifecycle for a row in `payment_attempts`. */
export type PaymentAttemptStatus =
  | 'created'
  | 'payment_required'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled'

/** Who initiated the attempt (browser page, agent, or direct API). */
export type PaymentClientType = 'browser' | 'agent' | 'api'

export interface PaymentAttempt {
  id: string
  slug: string
  label: string
  amount: string
  currency: string
  network: string
  status: PaymentAttemptStatus
  clientType: PaymentClientType
  paymentMethod: string
  payerAddress: string | null
  paymentSignatureHash: string | null
  txHash: string | null
  createdAt: string
  updatedAt: string
  paidAt: string | null
  expiresAt: string | null
}

export interface PaymentEvent {
  id: string
  attemptId: string
  eventType: string
  source: string
  payloadJson: string
  createdAt: string
}

export interface CreatePaymentAttemptInput {
  id: string
  slug: string
  label: string
  amount: string
  currency: string
  network: string
  status: PaymentAttemptStatus
  clientType: PaymentClientType
  paymentMethod?: string
  payerAddress?: string | null
  paymentSignatureHash?: string | null
  txHash?: string | null
  createdAt: string
  updatedAt: string
  paidAt?: string | null
  expiresAt?: string | null
}

export interface InsertPaymentEventInput {
  id: string
  attemptId: string
  eventType: string
  source: string
  payloadJson: string
  createdAt: string
}
