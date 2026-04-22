import { createCapabilityNotificationDeliveryId } from '../lib/ids'
import { nowIso } from '../lib/time'

export type CapabilityNotificationDeliveryStatus =
  | 'pending'
  | 'delivered'
  | 'failed'

export async function insertCapabilityNotificationDelivery(
  db: D1Database,
  input: {
    slug: string
    jobId: string | null
    eventType: string
    channel: 'email' | 'webhook'
    status: CapabilityNotificationDeliveryStatus
    metadata?: Record<string, unknown> | null
  },
): Promise<string> {
  const id = createCapabilityNotificationDeliveryId()
  const t = nowIso()
  const meta =
    input.metadata != null ? JSON.stringify(input.metadata) : null
  await db
    .prepare(
      `INSERT INTO capability_notification_deliveries (
        id, created_at, slug, job_id, event_type, channel, status,
        attempted_at, completed_at, error_message, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)`,
    )
    .bind(
      id,
      t,
      input.slug,
      input.jobId,
      input.eventType,
      input.channel,
      input.status,
      meta,
    )
    .run()
  return id
}

export async function markCapabilityNotificationDeliveryFinished(
  db: D1Database,
  id: string,
  input: {
    status: 'delivered' | 'failed'
    attemptedAt: string
    completedAt: string
    errorMessage: string | null
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE capability_notification_deliveries SET
        status = ?,
        attempted_at = ?,
        completed_at = ?,
        error_message = ?
      WHERE id = ?`,
    )
    .bind(
      input.status,
      input.attemptedAt,
      input.completedAt,
      input.errorMessage,
      id,
    )
    .run()
}

export async function getCapabilityNotificationDeliveryById(
  db: D1Database,
  id: string,
): Promise<{
  id: string
  slug: string
  created_at: string
  job_id: string | null
  event_type: string
  channel: string
  status: string
  attempted_at: string | null
  completed_at: string | null
  error_message: string | null
  metadata_json: string | null
} | null> {
  const row = await db
    .prepare(
      `SELECT id, slug, created_at, job_id, event_type, channel, status,
              attempted_at, completed_at, error_message, metadata_json
       FROM capability_notification_deliveries
       WHERE id = ?`,
    )
    .bind(id)
    .first<{
      id: string
      slug: string
      created_at: string
      job_id: string | null
      event_type: string
      channel: string
      status: string
      attempted_at: string | null
      completed_at: string | null
      error_message: string | null
      metadata_json: string | null
    }>()
  if (!row) return null
  return {
    id: String(row.id),
    slug: String(row.slug),
    created_at: String(row.created_at),
    job_id: row.job_id != null ? String(row.job_id) : null,
    event_type: String(row.event_type),
    channel: String(row.channel),
    status: String(row.status),
    attempted_at:
      row.attempted_at != null && row.attempted_at !== ''
        ? String(row.attempted_at)
        : null,
    completed_at:
      row.completed_at != null && row.completed_at !== ''
        ? String(row.completed_at)
        : null,
    error_message:
      row.error_message != null && row.error_message !== ''
        ? String(row.error_message)
        : null,
    metadata_json:
      row.metadata_json != null && row.metadata_json !== ''
        ? String(row.metadata_json)
        : null,
  }
}

export async function listRecentNotificationDeliveriesForSlug(
  db: D1Database,
  input: {
    slug: string
    limit: number
    status?: string | null
    channel?: string | null
  },
): Promise<
  {
    id: string
    created_at: string
    job_id: string | null
    event_type: string
    channel: string
    status: string
    attempted_at: string | null
    completed_at: string | null
    error_message: string | null
  }[]
> {
  const { slug, limit, status, channel } = input
  const wantStatus =
    status != null &&
    status !== '' &&
    ['pending', 'delivered', 'failed'].includes(status)
      ? status
      : null
  const wantChannel =
    channel != null && channel !== '' && ['email', 'webhook'].includes(channel)
      ? channel
      : null
  const res = await db
    .prepare(
      `SELECT id, created_at, job_id, event_type, channel, status,
              attempted_at, completed_at, error_message
       FROM capability_notification_deliveries
       WHERE slug = ?
         AND (? IS NULL OR status = ?)
         AND (? IS NULL OR channel = ?)
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(
      slug,
      wantStatus,
      wantStatus,
      wantChannel,
      wantChannel,
      limit,
    )
    .all<{
      id: string
      created_at: string
      job_id: string | null
      event_type: string
      channel: string
      status: string
      attempted_at: string | null
      completed_at: string | null
      error_message: string | null
    }>()
  return (res.results ?? []).map((r) => ({
    id: String(r.id),
    created_at: String(r.created_at),
    job_id: r.job_id != null ? String(r.job_id) : null,
    event_type: String(r.event_type),
    channel: String(r.channel),
    status: String(r.status),
    attempted_at:
      r.attempted_at != null && r.attempted_at !== ''
        ? String(r.attempted_at)
        : null,
    completed_at:
      r.completed_at != null && r.completed_at !== ''
        ? String(r.completed_at)
        : null,
    error_message:
      r.error_message != null && r.error_message !== ''
        ? String(r.error_message)
        : null,
  }))
}

/** Phase 6 — notification delivery success rate within a time window. */
export async function getNotificationDeliveryStatsForSlugWindow(
  db: D1Database,
  slug: string,
  sinceModifier: string,
): Promise<{
  total: number
  delivered: number
  failed: number
  pending: number
}> {
  const row = await db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
       FROM capability_notification_deliveries
       WHERE slug = ? AND created_at >= datetime('now', ?)`,
    )
    .bind(slug, sinceModifier)
    .first<{
      total: number
      delivered: number | null
      failed: number | null
      pending: number | null
    }>()
  return {
    total: Number(row?.total) || 0,
    delivered: Number(row?.delivered) || 0,
    failed: Number(row?.failed) || 0,
    pending: Number(row?.pending) || 0,
  }
}

/** Phase 7 — per-slug notification delivery stats in one window (seller ops index). */
export async function getNotificationDeliveryStatsForSlugsWindow(
  db: D1Database,
  slugs: string[],
  sinceModifier: string,
): Promise<
  Map<
    string,
    { total: number; delivered: number; failed: number; pending: number }
  >
> {
  const out = new Map<
    string,
    { total: number; delivered: number; failed: number; pending: number }
  >()
  if (slugs.length === 0) return out
  const ph = slugs.map(() => '?').join(', ')
  const res = await db
    .prepare(
      `SELECT slug,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
       FROM capability_notification_deliveries
       WHERE slug IN (${ph})
         AND created_at >= datetime('now', ?)
       GROUP BY slug`,
    )
    .bind(...slugs, sinceModifier)
    .all<{
      slug: string
      total: number
      delivered: number | null
      failed: number | null
      pending: number | null
    }>()
  for (const row of res.results ?? []) {
    const slug = String(row.slug)
    out.set(slug, {
      total: Number(row.total) || 0,
      delivered: Number(row.delivered) || 0,
      failed: Number(row.failed) || 0,
      pending: Number(row.pending) || 0,
    })
  }
  return out
}
