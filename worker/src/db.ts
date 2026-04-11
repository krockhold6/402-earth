import type { PaymentSession } from './session'

export type PaymentStatus = PaymentSession['status']
export type PaymentMethod = PaymentSession['paymentMethod']
export function newDbId(prefix: string): string {
  const hex = crypto.randomUUID().replace(/-/g, '')
  return `${prefix}_${hex.slice(0, 24)}`
}

function sessionFromRow(row: Record<string, unknown>): PaymentSession {
  return {
    sessionId: String(row.id),
    slug: String(row.slug),
    label: String(row.label),
    amount: String(row.amount),
    currency: String(row.currency),
    paymentMethod: row.payment_method as PaymentMethod,
    status: row.status as PaymentStatus,
    provider: (row.provider as PaymentSession['provider']) ?? null,
    providerRef: row.provider_ref != null ? String(row.provider_ref) : null,
    successUrl: String(row.success_url),
    cancelUrl: String(row.fail_url),
    createdAt: String(row.created_at),
    paidAt: row.paid_at != null ? String(row.paid_at) : null,
    expiresAt: String(row.expires_at),
  }
}

export async function insertSession(
  db: D1Database,
  session: PaymentSession,
  checkoutUrl: string | null,
  resourceUrl: string | null,
): Promise<void> {
  const now = session.createdAt
  await db
    .prepare(
      `INSERT INTO payment_sessions (
        id, slug, label, amount, currency, payment_method, status, provider, provider_ref,
        checkout_url, success_url, fail_url, resource_url,
        created_at, updated_at, paid_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      session.sessionId,
      session.slug,
      session.label,
      session.amount,
      session.currency,
      session.paymentMethod,
      session.status,
      session.provider,
      session.providerRef,
      checkoutUrl,
      session.successUrl,
      session.cancelUrl,
      resourceUrl,
      session.createdAt,
      now,
      session.paidAt,
      session.expiresAt,
    )
    .run()
}

export async function getSessionById(
  db: D1Database,
  id: string,
): Promise<PaymentSession | null> {
  const row = await db
    .prepare(
      `SELECT id, slug, label, amount, currency, payment_method, status, provider, provider_ref,
              success_url, fail_url, created_at, paid_at, expires_at
       FROM payment_sessions WHERE id = ?`,
    )
    .bind(id)
    .first<Record<string, unknown>>()
  return row ? sessionFromRow(row) : null
}

export async function getSessionByProviderRef(
  db: D1Database,
  providerRef: string,
): Promise<PaymentSession | null> {
  const row = await db
    .prepare(
      `SELECT id, slug, label, amount, currency, payment_method, status, provider, provider_ref,
              success_url, fail_url, created_at, paid_at, expires_at
       FROM payment_sessions WHERE provider_ref = ? LIMIT 1`,
    )
    .bind(providerRef)
    .first<Record<string, unknown>>()
  return row ? sessionFromRow(row) : null
}

export async function updateSessionFields(
  db: D1Database,
  sessionId: string,
  patch: {
    status?: PaymentStatus
    provider?: PaymentSession['provider']
    providerRef?: string | null
    paidAt?: string | null
    checkoutUrl?: string | null
  },
  updatedAt: string,
): Promise<void> {
  const sets: string[] = ['updated_at = ?']
  const values: unknown[] = [updatedAt]
  if (patch.status !== undefined) {
    sets.push('status = ?')
    values.push(patch.status)
  }
  if (patch.provider !== undefined) {
    sets.push('provider = ?')
    values.push(patch.provider)
  }
  if (patch.providerRef !== undefined) {
    sets.push('provider_ref = ?')
    values.push(patch.providerRef)
  }
  if (patch.paidAt !== undefined) {
    sets.push('paid_at = ?')
    values.push(patch.paidAt)
  }
  if (patch.checkoutUrl !== undefined) {
    sets.push('checkout_url = ?')
    values.push(patch.checkoutUrl)
  }
  values.push(sessionId)
  await db
    .prepare(`UPDATE payment_sessions SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run()
}

export async function recordStatusTransition(
  db: D1Database,
  sessionId: string,
  fromStatus: PaymentStatus,
  toStatus: PaymentStatus,
  reason: string | null,
  source: string,
  createdAt: string,
): Promise<void> {
  const id = newDbId('pst')
  await db
    .prepare(
      `INSERT INTO payment_status_transitions (id, session_id, from_status, to_status, reason, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, sessionId, fromStatus, toStatus, reason, source, createdAt)
    .run()
}

export async function tryInsertWebhookEvent(
  db: D1Database,
  input: {
    provider: string
    providerEventId: string
    providerRef: string | null
    sessionId: string | null
    eventType: string
    payloadJson: string
    receivedAt: string
  },
): Promise<'inserted' | 'duplicate'> {
  const id = newDbId('pwe')
  try {
    await db
      .prepare(
        `INSERT INTO payment_webhook_events (
          id, provider, provider_event_id, provider_ref, session_id, event_type, payload_json, received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.provider,
        input.providerEventId,
        input.providerRef,
        input.sessionId,
        input.eventType,
        input.payloadJson,
        input.receivedAt,
      )
      .run()
    return 'inserted'
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/unique/i.test(msg)) return 'duplicate'
    throw e
  }
}

export async function markWebhookProcessed(
  db: D1Database,
  provider: string,
  providerEventId: string,
  processedAt: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE payment_webhook_events SET processed_at = ? WHERE provider = ? AND provider_event_id = ?`,
    )
    .bind(processedAt, provider, providerEventId)
    .run()
}
