import type {
  CreatePaymentAttemptInput,
  PaymentAttempt,
  PaymentAttemptStatus,
} from '../types/payment'

function rowToAttempt(row: Record<string, unknown>): PaymentAttempt {
  return {
    id: String(row.id),
    slug: String(row.slug),
    label: String(row.label),
    amount: String(row.amount),
    currency: String(row.currency),
    network: String(row.network),
    status: row.status as PaymentAttempt['status'],
    clientType: row.client_type as PaymentAttempt['clientType'],
    paymentMethod: String(row.payment_method),
    payerAddress:
      row.payer_address != null ? String(row.payer_address) : null,
    paymentSignatureHash:
      row.payment_signature_hash != null
        ? String(row.payment_signature_hash)
        : null,
    txHash: row.tx_hash != null ? String(row.tx_hash) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    paidAt: row.paid_at != null ? String(row.paid_at) : null,
    expiresAt: row.expires_at != null ? String(row.expires_at) : null,
  }
}

export async function createAttempt(
  db: D1Database,
  input: CreatePaymentAttemptInput,
): Promise<void> {
  const paymentMethod = input.paymentMethod ?? 'x402'
  await db
    .prepare(
      `INSERT INTO payment_attempts (
        id, slug, label, amount, currency, network, status, client_type,
        payment_method, payer_address, payment_signature_hash, tx_hash,
        created_at, updated_at, paid_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.slug,
      input.label,
      input.amount,
      input.currency,
      input.network,
      input.status,
      input.clientType,
      paymentMethod,
      input.payerAddress ?? null,
      input.paymentSignatureHash ?? null,
      input.txHash ?? null,
      input.createdAt,
      input.updatedAt,
      input.paidAt ?? null,
      input.expiresAt ?? null,
    )
    .run()
}

export async function getAttemptById(
  db: D1Database,
  id: string,
): Promise<PaymentAttempt | null> {
  const row = await db
    .prepare(
      `SELECT id, slug, label, amount, currency, network, status, client_type,
              payment_method, payer_address, payment_signature_hash, tx_hash,
              created_at, updated_at, paid_at, expires_at
       FROM payment_attempts WHERE id = ?`,
    )
    .bind(id)
    .first<Record<string, unknown>>()
  return row ? rowToAttempt(row) : null
}

export async function updateAttemptStatus(
  db: D1Database,
  id: string,
  status: PaymentAttemptStatus,
  updatedAt: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE payment_attempts SET status = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(status, updatedAt, id)
    .run()
}

export type MarkAttemptPaidPatch = {
  payerAddress?: string | null
  paymentSignatureHash?: string | null
  txHash?: string | null
}

export async function markAttemptPaid(
  db: D1Database,
  id: string,
  paidAt: string,
  updatedAt: string,
  patch: MarkAttemptPaidPatch = {},
): Promise<void> {
  const sets: string[] = [
    'status = ?',
    'paid_at = ?',
    'updated_at = ?',
  ]
  const values: unknown[] = ['paid', paidAt, updatedAt]

  if (patch.payerAddress !== undefined) {
    sets.push('payer_address = ?')
    values.push(patch.payerAddress)
  }
  if (patch.paymentSignatureHash !== undefined) {
    sets.push('payment_signature_hash = ?')
    values.push(patch.paymentSignatureHash)
  }
  if (patch.txHash !== undefined) {
    sets.push('tx_hash = ?')
    values.push(patch.txHash)
  }

  values.push(id)
  await db
    .prepare(
      `UPDATE payment_attempts SET ${sets.join(', ')} WHERE id = ?`,
    )
    .bind(...values)
    .run()
}
