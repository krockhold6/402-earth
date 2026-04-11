import type { InsertPaymentEventInput } from '../types/payment'

export async function insertPaymentEvent(
  db: D1Database,
  input: InsertPaymentEventInput,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO payment_events (id, attempt_id, event_type, source, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.attemptId,
      input.eventType,
      input.source,
      input.payloadJson,
      input.createdAt,
    )
    .run()
}
