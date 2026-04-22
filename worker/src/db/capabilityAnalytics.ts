/**
 * Phase 5 — seller-facing capability health metrics (real aggregates from D1).
 */

export type CapabilityAnalyticsRow = {
  slug: string
  total_jobs: number
  completed_count: number
  failed_count: number
  retry_events: number
  avg_duration_ms: number | null
  last_job_created_at: string | null
  last_success_at: string | null
  last_failure_at: string | null
  full_result_still_available: number
}

export async function getCapabilityAnalyticsForSlug(
  db: D1Database,
  slug: string,
): Promise<CapabilityAnalyticsRow | null> {
  const row = await db
    .prepare(
      `SELECT
        COUNT(*) as total_jobs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
        SUM(CASE WHEN status IN ('completed','failed') AND attempt_count > 1 THEN attempt_count - 1 ELSE 0 END) as retry_events,
        AVG(CASE WHEN status = 'completed' AND execution_started_at IS NOT NULL AND execution_completed_at IS NOT NULL
          THEN (strftime('%s', execution_completed_at) - strftime('%s', execution_started_at)) * 1000.0 ELSE NULL END) as avg_duration_ms,
        MAX(created_at) as last_job_created_at,
        MAX(CASE WHEN status = 'completed' THEN execution_completed_at ELSE NULL END) as last_success_at,
        MAX(CASE WHEN status = 'failed' THEN failed_at ELSE NULL END) as last_failure_at,
        SUM(CASE WHEN status = 'completed' AND result_available = 1
          AND (result_retention_state IS NULL OR result_retention_state = 'available')
          THEN 1 ELSE 0 END) as full_result_still_available
      FROM capability_async_jobs WHERE slug = ?`,
    )
    .bind(slug)
    .first<{
      slug: string
      total_jobs: number
      completed_count: number | null
      failed_count: number | null
      retry_events: number | null
      avg_duration_ms: number | null
      last_job_created_at: string | null
      last_success_at: string | null
      last_failure_at: string | null
      full_result_still_available: number | null
    }>()
  if (!row) return null
  return {
    slug,
    total_jobs: Number(row.total_jobs) || 0,
    completed_count: Number(row.completed_count) || 0,
    failed_count: Number(row.failed_count) || 0,
    retry_events: Number(row.retry_events) || 0,
    avg_duration_ms:
      row.avg_duration_ms != null && !Number.isNaN(Number(row.avg_duration_ms))
        ? Math.round(Number(row.avg_duration_ms))
        : null,
    last_job_created_at:
      row.last_job_created_at != null && String(row.last_job_created_at) !== ''
        ? String(row.last_job_created_at)
        : null,
    last_success_at:
      row.last_success_at != null && String(row.last_success_at) !== ''
        ? String(row.last_success_at)
        : null,
    last_failure_at:
      row.last_failure_at != null && String(row.last_failure_at) !== ''
        ? String(row.last_failure_at)
        : null,
    full_result_still_available: Number(row.full_result_still_available) || 0,
  }
}

export async function getCapabilityAnalyticsForSlugs(
  db: D1Database,
  slugs: string[],
): Promise<Map<string, CapabilityAnalyticsRow>> {
  const out = new Map<string, CapabilityAnalyticsRow>()
  if (slugs.length === 0) return out
  const placeholders = slugs.map(() => '?').join(',')
  const res = await db
    .prepare(
      `SELECT
        slug,
        COUNT(*) as total_jobs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
        SUM(CASE WHEN status IN ('completed','failed') AND attempt_count > 1 THEN attempt_count - 1 ELSE 0 END) as retry_events,
        AVG(CASE WHEN status = 'completed' AND execution_started_at IS NOT NULL AND execution_completed_at IS NOT NULL
          THEN (strftime('%s', execution_completed_at) - strftime('%s', execution_started_at)) * 1000.0 ELSE NULL END) as avg_duration_ms,
        MAX(created_at) as last_job_created_at,
        MAX(CASE WHEN status = 'completed' THEN execution_completed_at ELSE NULL END) as last_success_at,
        MAX(CASE WHEN status = 'failed' THEN failed_at ELSE NULL END) as last_failure_at,
        SUM(CASE WHEN status = 'completed' AND result_available = 1
          AND (result_retention_state IS NULL OR result_retention_state = 'available')
          THEN 1 ELSE 0 END) as full_result_still_available
      FROM capability_async_jobs WHERE slug IN (${placeholders})
      GROUP BY slug`,
    )
    .bind(...slugs)
    .all<{
      slug: string
      total_jobs: number
      completed_count: number | null
      failed_count: number | null
      retry_events: number | null
      avg_duration_ms: number | null
      last_job_created_at: string | null
      last_success_at: string | null
      last_failure_at: string | null
      full_result_still_available: number | null
    }>()
  for (const row of res.results ?? []) {
    const slug = String(row.slug)
    out.set(slug, {
      slug,
      total_jobs: Number(row.total_jobs) || 0,
      completed_count: Number(row.completed_count) || 0,
      failed_count: Number(row.failed_count) || 0,
      retry_events: Number(row.retry_events) || 0,
      avg_duration_ms:
        row.avg_duration_ms != null && !Number.isNaN(Number(row.avg_duration_ms))
          ? Math.round(Number(row.avg_duration_ms))
          : null,
      last_job_created_at:
        row.last_job_created_at != null && String(row.last_job_created_at) !== ''
          ? String(row.last_job_created_at)
          : null,
      last_success_at:
        row.last_success_at != null && String(row.last_success_at) !== ''
          ? String(row.last_success_at)
          : null,
      last_failure_at:
        row.last_failure_at != null && String(row.last_failure_at) !== ''
          ? String(row.last_failure_at)
          : null,
      full_result_still_available: Number(row.full_result_still_available) || 0,
    })
  }
  return out
}

/** Phase 6 — time-windowed aggregates (SQLite datetime('now', modifier) is UTC). */
export type AnalyticsWindowId = '24h' | '7d' | '30d'

const WINDOW_LOWER: Record<AnalyticsWindowId, string> = {
  '24h': '-24 hours',
  '7d': '-7 days',
  '30d': '-30 days',
}

const WINDOW_PRIOR_LOWER: Record<AnalyticsWindowId, string> = {
  '24h': '-48 hours',
  '7d': '-14 days',
  '30d': '-60 days',
}

const WINDOW_PRIOR_UPPER: Record<AnalyticsWindowId, string> = {
  '24h': '-24 hours',
  '7d': '-7 days',
  '30d': '-30 days',
}

async function aggregateCapabilityJobsForSlugBounded(
  db: D1Database,
  slug: string,
  lowerMod: string,
  upperMod: string | null,
): Promise<CapabilityAnalyticsRow | null> {
  const hasUpper = upperMod != null
  const sql = hasUpper
    ? `SELECT
        COUNT(*) as total_jobs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
        SUM(CASE WHEN status IN ('completed','failed') AND attempt_count > 1 THEN attempt_count - 1 ELSE 0 END) as retry_events,
        AVG(CASE WHEN status = 'completed' AND execution_started_at IS NOT NULL AND execution_completed_at IS NOT NULL
          THEN (strftime('%s', execution_completed_at) - strftime('%s', execution_started_at)) * 1000.0 ELSE NULL END) as avg_duration_ms,
        MAX(created_at) as last_job_created_at,
        MAX(CASE WHEN status = 'completed' THEN execution_completed_at ELSE NULL END) as last_success_at,
        MAX(CASE WHEN status = 'failed' THEN failed_at ELSE NULL END) as last_failure_at,
        SUM(CASE WHEN status = 'completed' AND result_available = 1
          AND (result_retention_state IS NULL OR result_retention_state = 'available')
          THEN 1 ELSE 0 END) as full_result_still_available
      FROM capability_async_jobs
      WHERE slug = ?
        AND created_at >= datetime('now', ?)
        AND created_at < datetime('now', ?)`
    : `SELECT
        COUNT(*) as total_jobs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
        SUM(CASE WHEN status IN ('completed','failed') AND attempt_count > 1 THEN attempt_count - 1 ELSE 0 END) as retry_events,
        AVG(CASE WHEN status = 'completed' AND execution_started_at IS NOT NULL AND execution_completed_at IS NOT NULL
          THEN (strftime('%s', execution_completed_at) - strftime('%s', execution_started_at)) * 1000.0 ELSE NULL END) as avg_duration_ms,
        MAX(created_at) as last_job_created_at,
        MAX(CASE WHEN status = 'completed' THEN execution_completed_at ELSE NULL END) as last_success_at,
        MAX(CASE WHEN status = 'failed' THEN failed_at ELSE NULL END) as last_failure_at,
        SUM(CASE WHEN status = 'completed' AND result_available = 1
          AND (result_retention_state IS NULL OR result_retention_state = 'available')
          THEN 1 ELSE 0 END) as full_result_still_available
      FROM capability_async_jobs
      WHERE slug = ?
        AND created_at >= datetime('now', ?)`

  const stmt = hasUpper
    ? db.prepare(sql).bind(slug, lowerMod, upperMod!)
    : db.prepare(sql).bind(slug, lowerMod)

  const row = await stmt.first<{
    total_jobs: number
    completed_count: number | null
    failed_count: number | null
    retry_events: number | null
    avg_duration_ms: number | null
    last_job_created_at: string | null
    last_success_at: string | null
    last_failure_at: string | null
    full_result_still_available: number | null
  }>()
  if (!row) return null
  return {
    slug,
    total_jobs: Number(row.total_jobs) || 0,
    completed_count: Number(row.completed_count) || 0,
    failed_count: Number(row.failed_count) || 0,
    retry_events: Number(row.retry_events) || 0,
    avg_duration_ms:
      row.avg_duration_ms != null && !Number.isNaN(Number(row.avg_duration_ms))
        ? Math.round(Number(row.avg_duration_ms))
        : null,
    last_job_created_at:
      row.last_job_created_at != null && String(row.last_job_created_at) !== ''
        ? String(row.last_job_created_at)
        : null,
    last_success_at:
      row.last_success_at != null && String(row.last_success_at) !== ''
        ? String(row.last_success_at)
        : null,
    last_failure_at:
      row.last_failure_at != null && String(row.last_failure_at) !== ''
        ? String(row.last_failure_at)
        : null,
    full_result_still_available: Number(row.full_result_still_available) || 0,
  }
}

export async function getCapabilityAnalyticsForWindow(
  db: D1Database,
  slug: string,
  window: AnalyticsWindowId,
): Promise<{ current: CapabilityAnalyticsRow; prior: CapabilityAnalyticsRow }> {
  const lower = WINDOW_LOWER[window]
  const pLo = WINDOW_PRIOR_LOWER[window]
  const pHi = WINDOW_PRIOR_UPPER[window]
  const cur =
    (await aggregateCapabilityJobsForSlugBounded(db, slug, lower, null)) ??
    emptyAnalytics(slug)
  const prior =
    (await aggregateCapabilityJobsForSlugBounded(db, slug, pLo, pHi)) ??
    emptyAnalytics(slug)
  return { current: cur, prior }
}

function emptyAnalytics(slug: string): CapabilityAnalyticsRow {
  return {
    slug,
    total_jobs: 0,
    completed_count: 0,
    failed_count: 0,
    retry_events: 0,
    avg_duration_ms: null,
    last_job_created_at: null,
    last_success_at: null,
    last_failure_at: null,
    full_result_still_available: 0,
  }
}

export function analyticsSuccessRate(a: CapabilityAnalyticsRow): number | null {
  const terminal = a.completed_count + a.failed_count
  return terminal > 0 ? a.completed_count / terminal : null
}

export function analyticsResultAvailabilityRate(
  a: CapabilityAnalyticsRow,
): number | null {
  return a.completed_count > 0
    ? a.full_result_still_available / a.completed_count
    : null
}
