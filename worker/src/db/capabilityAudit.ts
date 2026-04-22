import { createCapabilityAuditEventId } from '../lib/ids'
import { nowIso } from '../lib/time'

export type CapabilityAuditActorScope = 'system' | 'seller' | 'operator'

export async function insertCapabilityAuditEvent(
  db: D1Database,
  input: {
    eventType: string
    slug?: string | null
    jobId?: string | null
    actorScope: CapabilityAuditActorScope
    actorIdentifier?: string | null
    statusSummary?: string | null
    metadata?: Record<string, unknown> | null
  },
): Promise<string> {
  const id = createCapabilityAuditEventId()
  const t = nowIso()
  const meta =
    input.metadata != null ? JSON.stringify(input.metadata) : null
  await db
    .prepare(
      `INSERT INTO capability_audit_events (
        id, created_at, event_type, slug, job_id, actor_scope, actor_identifier, status_summary, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      t,
      input.eventType,
      input.slug ?? null,
      input.jobId ?? null,
      input.actorScope,
      input.actorIdentifier ?? null,
      input.statusSummary ?? null,
      meta,
    )
    .run()
  return id
}

export async function listCapabilityAuditEventsForSlug(
  db: D1Database,
  slug: string,
  limit: number,
): Promise<
  {
    id: string
    created_at: string
    event_type: string
    job_id: string | null
    actor_scope: string
    actor_identifier: string | null
    status_summary: string | null
    metadata_json: string | null
  }[]
> {
  const res = await db
    .prepare(
      `SELECT id, created_at, event_type, job_id, actor_scope, actor_identifier, status_summary, metadata_json
       FROM capability_audit_events
       WHERE slug = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(slug, limit)
    .all<{
      id: string
      created_at: string
      event_type: string
      job_id: string | null
      actor_scope: string
      actor_identifier: string | null
      status_summary: string | null
      metadata_json: string | null
    }>()
  return (res.results ?? []).map((r) => ({
    id: String(r.id),
    created_at: String(r.created_at),
    event_type: String(r.event_type),
    job_id: r.job_id != null ? String(r.job_id) : null,
    actor_scope: String(r.actor_scope),
    actor_identifier:
      r.actor_identifier != null ? String(r.actor_identifier) : null,
    status_summary:
      r.status_summary != null ? String(r.status_summary) : null,
    metadata_json:
      r.metadata_json != null ? String(r.metadata_json) : null,
  }))
}

/** Phase 7 — audit rows tied to a specific async job (seller ops). */
export async function listCapabilityAuditEventsForJob(
  db: D1Database,
  slug: string,
  jobId: string,
  limit: number,
): Promise<
  {
    id: string
    created_at: string
    event_type: string
    job_id: string | null
    actor_scope: string
    actor_identifier: string | null
    status_summary: string | null
    metadata_json: string | null
  }[]
> {
  const res = await db
    .prepare(
      `SELECT id, created_at, event_type, job_id, actor_scope, actor_identifier, status_summary, metadata_json
       FROM capability_audit_events
       WHERE slug = ? AND job_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(slug, jobId, limit)
    .all<{
      id: string
      created_at: string
      event_type: string
      job_id: string | null
      actor_scope: string
      actor_identifier: string | null
      status_summary: string | null
      metadata_json: string | null
    }>()
  return (res.results ?? []).map((r) => ({
    id: String(r.id),
    created_at: String(r.created_at),
    event_type: String(r.event_type),
    job_id: r.job_id != null ? String(r.job_id) : null,
    actor_scope: String(r.actor_scope),
    actor_identifier:
      r.actor_identifier != null ? String(r.actor_identifier) : null,
    status_summary:
      r.status_summary != null ? String(r.status_summary) : null,
    metadata_json:
      r.metadata_json != null ? String(r.metadata_json) : null,
  }))
}

/** Phase 7 — counts of selected audit event types per slug in a time window. */
export async function countAuditEventsBySlugTypeWindow(
  db: D1Database,
  slugs: string[],
  sinceModifier: string,
  eventTypes: string[],
): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>()
  if (slugs.length === 0 || eventTypes.length === 0) return out
  const slugPh = slugs.map(() => '?').join(',')
  const typePh = eventTypes.map(() => '?').join(',')
  const res = await db
    .prepare(
      `SELECT slug, event_type, COUNT(*) as c
       FROM capability_audit_events
       WHERE slug IN (${slugPh})
         AND created_at >= datetime('now', ?)
         AND event_type IN (${typePh})
       GROUP BY slug, event_type`,
    )
    .bind(...slugs, sinceModifier, ...eventTypes)
    .all<{ slug: string; event_type: string; c: number }>()
  for (const row of res.results ?? []) {
    const slug = String(row.slug)
    const et = String(row.event_type)
    const c = Number(row.c) || 0
    let m = out.get(slug)
    if (!m) {
      m = new Map()
      out.set(slug, m)
    }
    m.set(et, c)
  }
  return out
}

/** Phase 8 — policy denial audit rows in a window (seller diagnostics). */
export async function countCapabilityPolicyDeniedForSlugWindow(
  db: D1Database,
  slug: string,
  sinceModifier: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) as c FROM capability_audit_events
       WHERE slug = ? AND event_type = 'capability_policy_denied'
         AND created_at >= datetime('now', ?)`,
    )
    .bind(slug, sinceModifier)
    .first<{ c: number | null }>()
  return Number(row?.c) || 0
}

/** Phase 8 — policy denial counts per slug in a window (seller ops index). */
export async function countCapabilityPolicyDeniedForSlugsWindow(
  db: D1Database,
  slugs: string[],
  sinceModifier: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (slugs.length === 0) return out
  const ph = slugs.map(() => '?').join(',')
  const res = await db
    .prepare(
      `SELECT slug, COUNT(*) as c FROM capability_audit_events
       WHERE slug IN (${ph})
         AND event_type = 'capability_policy_denied'
         AND created_at >= datetime('now', ?)
       GROUP BY slug`,
    )
    .bind(...slugs, sinceModifier)
    .all<{ slug: string; c: number | null }>()
  for (const row of res.results ?? []) {
    out.set(String(row.slug), Number(row.c) || 0)
  }
  return out
}
