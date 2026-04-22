export type CapabilityJobStatus =
  | 'pending'
  | 'running'
  | 'retry_scheduled'
  | 'completed'
  | 'failed'

export type CapabilityAsyncJobRow = {
  id: string
  attemptId: string
  slug: string
  status: string
  createdAt: string
  updatedAt: string
  executionStartedAt: string | null
  executionCompletedAt: string | null
  failedAt: string | null
  lastAttemptStartedAt: string | null
  attemptCount: number
  maxAttempts: number
  nextRetryAt: string | null
  failureClass: string | null
  lastError: string | null
  lastErrorSummary: string | null
  resultHash: string | null
  resultHttpStatus: number | null
  resultPreview: string | null
  providerMetadataJson: string | null
  resultAvailable: number
  resultContentType: string | null
  resultSizeBytes: number | null
  resultStorageKind: string | null
  resultExpiresAt: string | null
  resultStorageKey: string | null
  /** Phase 5: available | expired | deleted | preview_only | not_stored */
  resultRetentionState: string | null
}

function rowToJob(row: Record<string, unknown>): CapabilityAsyncJobRow {
  return {
    id: String(row.id),
    attemptId: String(row.attempt_id),
    slug: String(row.slug),
    status: String(row.status),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    executionStartedAt:
      row.execution_started_at != null && String(row.execution_started_at) !== ''
        ? String(row.execution_started_at)
        : null,
    executionCompletedAt:
      row.execution_completed_at != null &&
      String(row.execution_completed_at) !== ''
        ? String(row.execution_completed_at)
        : null,
    failedAt:
      row.failed_at != null && String(row.failed_at) !== ''
        ? String(row.failed_at)
        : null,
    lastAttemptStartedAt:
      row.last_attempt_started_at != null &&
      String(row.last_attempt_started_at) !== ''
        ? String(row.last_attempt_started_at)
        : null,
    attemptCount: Number(row.attempt_count) || 0,
    maxAttempts: Number(row.max_attempts) || 3,
    nextRetryAt:
      row.next_retry_at != null && String(row.next_retry_at) !== ''
        ? String(row.next_retry_at)
        : null,
    failureClass:
      row.failure_class != null && String(row.failure_class) !== ''
        ? String(row.failure_class)
        : null,
    lastError:
      row.last_error != null && String(row.last_error) !== ''
        ? String(row.last_error)
        : null,
    lastErrorSummary:
      row.last_error_summary != null &&
      String(row.last_error_summary) !== ''
        ? String(row.last_error_summary)
        : null,
    resultHash:
      row.result_hash != null && String(row.result_hash) !== ''
        ? String(row.result_hash)
        : null,
    resultHttpStatus:
      row.result_http_status != null && row.result_http_status !== ''
        ? Number(row.result_http_status)
        : null,
    resultPreview:
      row.result_preview != null && String(row.result_preview) !== ''
        ? String(row.result_preview)
        : null,
    providerMetadataJson:
      row.provider_metadata_json != null &&
      String(row.provider_metadata_json) !== ''
        ? String(row.provider_metadata_json)
        : null,
    resultAvailable: Number(row.result_available) || 0,
    resultContentType:
      row.result_content_type != null && String(row.result_content_type) !== ''
        ? String(row.result_content_type)
        : null,
    resultSizeBytes:
      row.result_size_bytes != null && row.result_size_bytes !== ''
        ? Number(row.result_size_bytes)
        : null,
    resultStorageKind:
      row.result_storage_kind != null &&
      String(row.result_storage_kind) !== ''
        ? String(row.result_storage_kind)
        : null,
    resultExpiresAt:
      row.result_expires_at != null && String(row.result_expires_at) !== ''
        ? String(row.result_expires_at)
        : null,
    resultStorageKey:
      row.result_storage_key != null && String(row.result_storage_key) !== ''
        ? String(row.result_storage_key)
        : null,
    resultRetentionState:
      row.result_retention_state != null &&
      String(row.result_retention_state) !== ''
        ? String(row.result_retention_state)
        : null,
  }
}

const JOB_SELECT = `SELECT id, attempt_id, slug, status, created_at, updated_at,
              execution_started_at, execution_completed_at, failed_at,
              last_attempt_started_at,
              attempt_count, max_attempts, next_retry_at, failure_class,
              last_error, last_error_summary,
              result_hash, result_http_status, result_preview, provider_metadata_json,
              result_available, result_content_type, result_size_bytes,
              result_storage_kind, result_expires_at, result_storage_key,
              result_retention_state`

export async function insertCapabilityAsyncJob(
  db: D1Database,
  input: {
    id: string
    attemptId: string
    slug: string
    createdAt: string
    maxAttempts?: number
  },
): Promise<void> {
  const t = input.createdAt
  const maxA = input.maxAttempts ?? 3
  await db
    .prepare(
      `INSERT INTO capability_async_jobs (
        id, attempt_id, slug, status, created_at, updated_at,
        execution_started_at, execution_completed_at, failed_at,
        last_attempt_started_at,
        attempt_count, max_attempts, next_retry_at, failure_class,
        last_error, last_error_summary,
        result_hash, result_http_status, result_preview, provider_metadata_json,
        result_available, result_content_type, result_size_bytes,
        result_storage_kind, result_expires_at, result_storage_key,
        result_retention_state
      ) VALUES (?, ?, ?, 'pending', ?, ?, NULL, NULL, NULL, NULL,
        0, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        0, NULL, NULL, NULL, NULL, NULL, NULL)`,
    )
    .bind(input.id, input.attemptId, input.slug, t, t, maxA)
    .run()
}

export async function getCapabilityJobById(
  db: D1Database,
  id: string,
): Promise<CapabilityAsyncJobRow | null> {
  const row = await db
    .prepare(`${JOB_SELECT} FROM capability_async_jobs WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>()
  return row ? rowToJob(row) : null
}

export async function findCapabilityJobByAttemptId(
  db: D1Database,
  attemptId: string,
): Promise<CapabilityAsyncJobRow | null> {
  const row = await db
    .prepare(
      `${JOB_SELECT} FROM capability_async_jobs WHERE attempt_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(attemptId)
    .first<Record<string, unknown>>()
  return row ? rowToJob(row) : null
}

/** Jobs ready for durable executor: pending or retry_scheduled with elapsed backoff. */
export async function listEligibleCapabilityJobIds(
  db: D1Database,
  input: { nowIso: string; limit: number },
): Promise<string[]> {
  const res = await db
    .prepare(
      `${JOB_SELECT} FROM capability_async_jobs
       WHERE status IN ('pending', 'retry_scheduled')
         AND (next_retry_at IS NULL OR next_retry_at <= ?)
         AND attempt_count < max_attempts
       ORDER BY created_at ASC
       LIMIT ?`,
    )
    .bind(input.nowIso, input.limit)
    .all<Record<string, unknown>>()
  const rows = res.results ?? []
  return rows.map((r) => String(r.id))
}

/**
 * Claim job for one execution attempt. Increments attempt_count; sets first execution_started_at.
 */
export async function tryMarkJobRunning(
  db: D1Database,
  jobId: string,
  startedAt: string,
  nowIso: string,
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE capability_async_jobs
       SET status = 'running',
           attempt_count = attempt_count + 1,
           last_attempt_started_at = ?,
           execution_started_at = COALESCE(execution_started_at, ?),
           next_retry_at = NULL,
           updated_at = ?
       WHERE id = ?
         AND status IN ('pending', 'retry_scheduled')
         AND (next_retry_at IS NULL OR next_retry_at <= ?)
         AND attempt_count < max_attempts`,
    )
    .bind(startedAt, startedAt, startedAt, jobId, nowIso)
    .run()
  return (res.meta?.changes ?? 0) > 0
}

/** Reset stuck running jobs so cron can retry (same attempt slot, no increment yet on re-run). */
export async function recoverStaleRunningJobs(
  db: D1Database,
  staleBeforeIso: string,
  updatedAt: string,
): Promise<number> {
  const res = await db
    .prepare(
      `UPDATE capability_async_jobs
       SET status = 'pending',
           updated_at = ?,
           attempt_count = CASE WHEN attempt_count > 0 THEN attempt_count - 1 ELSE 0 END,
           last_error = 'stale_running_recovered',
           last_error_summary = 'Previous run did not finish; queued again.'
       WHERE status = 'running'
         AND (
           (last_attempt_started_at IS NOT NULL AND last_attempt_started_at < ?)
           OR (last_attempt_started_at IS NULL AND execution_started_at IS NOT NULL AND execution_started_at < ?)
         )`,
    )
    .bind(updatedAt, staleBeforeIso, staleBeforeIso)
    .run()
  return res.meta?.changes ?? 0
}

export async function markJobCompleted(
  db: D1Database,
  input: {
    id: string
    completedAt: string
    resultHash: string | null
    resultHttpStatus: number | null
    resultPreview: string | null
    providerMetadataJson: string | null
    resultAvailable: boolean
    resultContentType: string | null
    resultSizeBytes: number | null
    resultStorageKind: string | null
    resultExpiresAt: string | null
    resultStorageKey: string | null
    resultRetentionState: string | null
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE capability_async_jobs SET
        status = 'completed',
        execution_completed_at = ?,
        updated_at = ?,
        result_hash = ?,
        result_http_status = ?,
        result_preview = ?,
        provider_metadata_json = ?,
        result_available = ?,
        result_content_type = ?,
        result_size_bytes = ?,
        result_storage_kind = ?,
        result_expires_at = ?,
        result_storage_key = ?,
        result_retention_state = ?,
        failure_class = NULL,
        next_retry_at = NULL
      WHERE id = ?`,
    )
    .bind(
      input.completedAt,
      input.completedAt,
      input.resultHash,
      input.resultHttpStatus,
      input.resultPreview,
      input.providerMetadataJson,
      input.resultAvailable ? 1 : 0,
      input.resultContentType,
      input.resultSizeBytes,
      input.resultStorageKind,
      input.resultExpiresAt,
      input.resultStorageKey,
      input.resultRetentionState,
      input.id,
    )
    .run()
}

export async function markJobTerminalFailed(
  db: D1Database,
  input: {
    id: string
    failedAt: string
    lastError: string
    lastErrorSummary: string
    failureClass: string
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE capability_async_jobs SET
        status = 'failed',
        failed_at = ?,
        updated_at = ?,
        last_error = ?,
        last_error_summary = ?,
        failure_class = ?,
        execution_completed_at = ?,
        next_retry_at = NULL
      WHERE id = ?`,
    )
    .bind(
      input.failedAt,
      input.failedAt,
      input.lastError,
      input.lastErrorSummary,
      input.failureClass,
      input.failedAt,
      input.id,
    )
    .run()
}

export async function markJobRetryScheduled(
  db: D1Database,
  input: {
    id: string
    updatedAt: string
    nextRetryAt: string
    lastError: string
    lastErrorSummary: string
    failureClass: string
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE capability_async_jobs SET
        status = 'retry_scheduled',
        updated_at = ?,
        next_retry_at = ?,
        last_error = ?,
        last_error_summary = ?,
        failure_class = ?
      WHERE id = ?`,
    )
    .bind(
      input.updatedAt,
      input.nextRetryAt,
      input.lastError,
      input.lastErrorSummary,
      input.failureClass,
      input.id,
    )
    .run()
}

/** Aggregates for ops dashboard. */
export async function countCapabilityJobsByStatus(
  db: D1Database,
): Promise<Record<string, number>> {
  const res = await db
    .prepare(
      `SELECT status, COUNT(*) as c FROM capability_async_jobs GROUP BY status`,
    )
    .all<{ status: string; c: number }>()
  const out: Record<string, number> = {}
  for (const row of res.results ?? []) {
    out[String(row.status)] = Number(row.c) || 0
  }
  return out
}

/** Jobs occupying the async concurrency slot (Phase 6 policy). */
export async function countConcurrentAsyncJobsForSlug(
  db: D1Database,
  slug: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) as c FROM capability_async_jobs
       WHERE slug = ?
         AND status IN ('pending', 'running', 'retry_scheduled')`,
    )
    .bind(slug)
    .first<{ c: number }>()
  return Number(row?.c) || 0
}

export async function avgCompletedCapabilityDurationMs(
  db: D1Database,
): Promise<number | null> {
  const row = await db
    .prepare(
      `SELECT AVG(
         (strftime('%s', execution_completed_at) - strftime('%s', execution_started_at)) * 1000
       ) AS avg_ms
       FROM capability_async_jobs
       WHERE status = 'completed'
         AND execution_started_at IS NOT NULL
         AND execution_completed_at IS NOT NULL`,
    )
    .first<{ avg_ms: number | null }>()
  if (row?.avg_ms == null || Number.isNaN(row.avg_ms)) return null
  return Math.round(row.avg_ms)
}

export async function recentFailedCapabilityJobs(
  db: D1Database,
  limit: number,
): Promise<
  {
    id: string
    slug: string
    failure_class: string | null
    last_error_summary: string | null
    attempt_count: number
    updated_at: string
  }[]
> {
  const res = await db
    .prepare(
      `SELECT id, slug, failure_class, last_error_summary, attempt_count, updated_at
       FROM capability_async_jobs
       WHERE status = 'failed'
       ORDER BY COALESCE(failed_at, updated_at) DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<{
      id: string
      slug: string
      failure_class: string | null
      last_error_summary: string | null
      attempt_count: number
      updated_at: string
    }>()
  return (res.results ?? []).map((r) => ({
    id: String(r.id),
    slug: String(r.slug),
    failure_class: r.failure_class != null ? String(r.failure_class) : null,
    last_error_summary:
      r.last_error_summary != null ? String(r.last_error_summary) : null,
    attempt_count: Number(r.attempt_count) || 0,
    updated_at: String(r.updated_at),
  }))
}

/** Host-level failure counts from recent terminal failures (best-effort). */
export async function failureCountsByOriginHost(
  db: D1Database,
  limit: number,
): Promise<{ host: string; failures: number }[]> {
  const res = await db
    .prepare(
      `SELECT r.capability_origin_host as host, COUNT(*) as c
       FROM capability_async_jobs j
       JOIN resource_definitions r ON r.slug = j.slug
       WHERE j.status = 'failed'
         AND r.capability_origin_host IS NOT NULL
         AND r.capability_origin_host != ''
       GROUP BY r.capability_origin_host
       ORDER BY c DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<{ host: string; c: number }>()
  return (res.results ?? []).map((r) => ({
    host: String(r.host),
    failures: Number(r.c) || 0,
  }))
}

export async function listRecentJobsForSlug(
  db: D1Database,
  slug: string,
  limit: number,
): Promise<
  {
    id: string
    status: string
    created_at: string
    updated_at: string
    attempt_count: number
    max_attempts: number
    last_error_summary: string | null
    result_preview: string | null
  }[]
> {
  const res = await db
    .prepare(
      `SELECT id, status, created_at, updated_at, attempt_count, max_attempts, last_error_summary, result_preview
       FROM capability_async_jobs
       WHERE slug = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(slug, limit)
    .all<{
      id: string
      status: string
      created_at: string
      updated_at: string
      attempt_count: number
      max_attempts: number
      last_error_summary: string | null
      result_preview: string | null
    }>()
  return (res.results ?? []).map((r) => ({
    id: String(r.id),
    status: String(r.status),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    attempt_count: Number(r.attempt_count) || 0,
    max_attempts: Number(r.max_attempts) || 3,
    last_error_summary:
      r.last_error_summary != null ? String(r.last_error_summary) : null,
    result_preview:
      r.result_preview != null ? String(r.result_preview) : null,
  }))
}

export async function countJobsByStatusForSlug(
  db: D1Database,
  slug: string,
): Promise<Record<string, number>> {
  const res = await db
    .prepare(
      `SELECT status, COUNT(*) as c FROM capability_async_jobs WHERE slug = ? GROUP BY status`,
    )
    .bind(slug)
    .all<{ status: string; c: number }>()
  const out: Record<string, number> = {}
  for (const row of res.results ?? []) {
    out[String(row.status)] = Number(row.c) || 0
  }
  return out
}

/** Jobs whose stored full result (D1 or R2) is past expiry — cleanup candidates. */
export async function listJobsWithExpiredFullResults(
  db: D1Database,
  beforeIso: string,
  limit: number,
): Promise<
  {
    id: string
    slug: string
    result_storage_kind: string | null
    result_storage_key: string | null
  }[]
> {
  const res = await db
    .prepare(
      `SELECT id, slug, result_storage_kind, result_storage_key
       FROM capability_async_jobs
       WHERE status = 'completed'
         AND result_expires_at IS NOT NULL AND result_expires_at != ''
         AND result_expires_at < ?
         AND result_available = 1
         AND result_storage_kind IN ('d1_inline', 'r2_object')
       LIMIT ?`,
    )
    .bind(beforeIso, limit)
    .all<{
      id: string
      slug: string
      result_storage_kind: string | null
      result_storage_key: string | null
    }>()
  return (res.results ?? []).map((r) => ({
    id: String(r.id),
    slug: String(r.slug),
    result_storage_kind:
      r.result_storage_kind != null ? String(r.result_storage_kind) : null,
    result_storage_key:
      r.result_storage_key != null ? String(r.result_storage_key) : null,
  }))
}

export async function markJobFullResultExpired(
  db: D1Database,
  jobId: string,
  updatedAt: string,
  retentionLabel: 'expired' | 'deleted',
): Promise<void> {
  await db
    .prepare(
      `UPDATE capability_async_jobs SET
        updated_at = ?,
        result_available = 0,
        result_retention_state = ?,
        result_storage_key = NULL
      WHERE id = ?`,
    )
    .bind(updatedAt, retentionLabel, jobId)
    .run()
}

export type SellerHistoryJobRow = {
  id: string
  status: string
  created_at: string
  updated_at: string
  attempt_count: number
  max_attempts: number
  last_error_summary: string | null
  result_preview: string | null
  result_available: number
  result_storage_kind: string | null
  result_expires_at: string | null
  result_retention_state: string | null
  execution_completed_at: string | null
  failed_at: string | null
  failure_class: string | null
  result_http_status: number | null
}

export async function listRecentJobsForSellerHistory(
  db: D1Database,
  slug: string,
  limit: number,
): Promise<SellerHistoryJobRow[]> {
  const res = await db
    .prepare(
      `SELECT id, status, created_at, updated_at, attempt_count, max_attempts,
              last_error_summary, result_preview,
              result_available, result_storage_kind, result_expires_at, result_retention_state,
              execution_completed_at, failed_at, failure_class, result_http_status
       FROM capability_async_jobs
       WHERE slug = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(slug, limit)
    .all<Record<string, unknown>>()
  return (res.results ?? []).map((r) => ({
    id: String(r.id),
    status: String(r.status),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    attempt_count: Number(r.attempt_count) || 0,
    max_attempts: Number(r.max_attempts) || 3,
    last_error_summary:
      r.last_error_summary != null ? String(r.last_error_summary) : null,
    result_preview:
      r.result_preview != null ? String(r.result_preview) : null,
    result_available: Number(r.result_available) || 0,
    result_storage_kind:
      r.result_storage_kind != null ? String(r.result_storage_kind) : null,
    result_expires_at:
      r.result_expires_at != null ? String(r.result_expires_at) : null,
    result_retention_state:
      r.result_retention_state != null
        ? String(r.result_retention_state)
        : null,
    execution_completed_at:
      r.execution_completed_at != null
        ? String(r.execution_completed_at)
        : null,
    failed_at: r.failed_at != null ? String(r.failed_at) : null,
    failure_class:
      r.failure_class != null ? String(r.failure_class) : null,
    result_http_status:
      r.result_http_status != null && r.result_http_status !== ''
        ? Number(r.result_http_status)
        : null,
  }))
}

export async function listRecentFailureClassesForSlug(
  db: D1Database,
  slug: string,
  limit: number,
): Promise<(string | null)[]> {
  const res = await db
    .prepare(
      `SELECT failure_class FROM capability_async_jobs
       WHERE slug = ? AND status = 'failed'
       ORDER BY COALESCE(failed_at, updated_at) DESC
       LIMIT ?`,
    )
    .bind(slug, limit)
    .all<{ failure_class: string | null }>()
  return (res.results ?? []).map((r) =>
    r.failure_class != null && String(r.failure_class) !== ''
      ? String(r.failure_class)
      : null,
  )
}

const SELLER_JOB_STATUS_WHITELIST = new Set<CapabilityJobStatus>([
  'pending',
  'running',
  'retry_scheduled',
  'completed',
  'failed',
])

/** Phase 7 — concurrent async slots per slug (for seller policy summary). */
export async function countConcurrentAsyncJobsBySlugs(
  db: D1Database,
  slugs: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (slugs.length === 0) return out
  const ph = slugs.map(() => '?').join(',')
  const res = await db
    .prepare(
      `SELECT slug, COUNT(*) as c FROM capability_async_jobs
       WHERE slug IN (${ph})
         AND status IN ('pending', 'running', 'retry_scheduled')
       GROUP BY slug`,
    )
    .bind(...slugs)
    .all<{ slug: string; c: number }>()
  for (const row of res.results ?? []) {
    out.set(String(row.slug), Number(row.c) || 0)
  }
  return out
}

export type SellerJobHistoryQuery = {
  slug: string
  limit: number
  cursorCreatedAt: string | null
  cursorId: string | null
  status: string | null
  failureClass: string | null
  resultRetentionState: string | null
  resultAvailable: 'yes' | 'no' | null
  /** SQLite datetime('now', modifier), e.g. '-7 days' */
  sinceModifier: string | null
}

/**
 * Phase 7 — keyset-paginated job history for seller ops (newest first).
 */
export async function listSellerCapabilityJobsPaginated(
  db: D1Database,
  q: SellerJobHistoryQuery,
): Promise<CapabilityAsyncJobRow[]> {
  const lim = Math.min(100, Math.max(1, Math.floor(q.limit)))
  const parts: string[] = [`slug = ?`]
  const binds: unknown[] = [q.slug]

  if (q.status && SELLER_JOB_STATUS_WHITELIST.has(q.status as CapabilityJobStatus)) {
    parts.push(`status = ?`)
    binds.push(q.status)
  }
  if (q.failureClass?.trim()) {
    parts.push(`failure_class = ?`)
    binds.push(q.failureClass.trim())
  }
  if (q.resultRetentionState?.trim()) {
    parts.push(`result_retention_state = ?`)
    binds.push(q.resultRetentionState.trim())
  }
  if (q.resultAvailable === 'yes') {
    parts.push(`result_available = 1`)
  } else if (q.resultAvailable === 'no') {
    parts.push(`result_available = 0`)
  }
  if (q.sinceModifier?.trim()) {
    parts.push(`created_at >= datetime('now', ?)`)
    binds.push(q.sinceModifier.trim())
  }
  if (q.cursorCreatedAt?.trim() && q.cursorId?.trim()) {
    parts.push(`(created_at < ? OR (created_at = ? AND id < ?))`)
    binds.push(q.cursorCreatedAt.trim(), q.cursorCreatedAt.trim(), q.cursorId.trim())
  }

  const where = parts.join(' AND ')
  const res = await db
    .prepare(
      `${JOB_SELECT} FROM capability_async_jobs
       WHERE ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .bind(...binds, lim)
    .all<Record<string, unknown>>()
  return (res.results ?? []).map((r) => rowToJob(r))
}

export type SellerJobDiagnosticsWindow = {
  window_since_modifier: string
  failed_jobs: number
  trust_failure_jobs: number
  validation_failure_jobs: number
  transport_failure_jobs: number
  upstream_client_failure_jobs: number
  permanent_failure_jobs: number
  retry_units: number
  expired_or_deleted_result_jobs: number
  jobs_still_retrying: number
}

/**
 * Phase 7 — bounded operational counts from real job rows (SQLite window).
 */
export async function getSellerJobDiagnosticsWindowForSlug(
  db: D1Database,
  slug: string,
  sinceModifier: string,
): Promise<SellerJobDiagnosticsWindow> {
  const row = await db
    .prepare(
      `SELECT
        SUM(CASE WHEN status = 'failed'
          AND datetime(COALESCE(failed_at, updated_at)) >= datetime('now', ?) THEN 1 ELSE 0 END) as failed_jobs,
        SUM(CASE WHEN status = 'failed' AND failure_class = 'trust'
          AND datetime(COALESCE(failed_at, updated_at)) >= datetime('now', ?) THEN 1 ELSE 0 END) as trust_failure_jobs,
        SUM(CASE WHEN status = 'failed' AND failure_class = 'validation'
          AND datetime(COALESCE(failed_at, updated_at)) >= datetime('now', ?) THEN 1 ELSE 0 END) as validation_failure_jobs,
        SUM(CASE WHEN status = 'failed' AND failure_class = 'transport'
          AND datetime(COALESCE(failed_at, updated_at)) >= datetime('now', ?) THEN 1 ELSE 0 END) as transport_failure_jobs,
        SUM(CASE WHEN status = 'failed' AND failure_class = 'upstream_client'
          AND datetime(COALESCE(failed_at, updated_at)) >= datetime('now', ?) THEN 1 ELSE 0 END) as upstream_client_failure_jobs,
        SUM(CASE WHEN status = 'failed' AND failure_class = 'permanent'
          AND datetime(COALESCE(failed_at, updated_at)) >= datetime('now', ?) THEN 1 ELSE 0 END) as permanent_failure_jobs,
        SUM(CASE WHEN status IN ('completed','failed') AND attempt_count > 1
          AND datetime(updated_at) >= datetime('now', ?) THEN attempt_count - 1 ELSE 0 END) as retry_units,
        SUM(CASE WHEN status = 'completed'
          AND result_retention_state IN ('expired','deleted')
          AND datetime(updated_at) >= datetime('now', ?) THEN 1 ELSE 0 END) as expired_or_deleted_result_jobs,
        SUM(CASE WHEN status IN ('pending','running','retry_scheduled')
          AND attempt_count > 0
          AND datetime(updated_at) >= datetime('now', ?) THEN 1 ELSE 0 END) as jobs_still_retrying
       FROM capability_async_jobs
       WHERE slug = ?`,
    )
    .bind(
      sinceModifier,
      sinceModifier,
      sinceModifier,
      sinceModifier,
      sinceModifier,
      sinceModifier,
      sinceModifier,
      sinceModifier,
      sinceModifier,
      slug,
    )
    .first<Record<string, unknown>>()
  return {
    window_since_modifier: sinceModifier,
    failed_jobs: Number(row?.failed_jobs) || 0,
    trust_failure_jobs: Number(row?.trust_failure_jobs) || 0,
    validation_failure_jobs: Number(row?.validation_failure_jobs) || 0,
    transport_failure_jobs: Number(row?.transport_failure_jobs) || 0,
    upstream_client_failure_jobs:
      Number(row?.upstream_client_failure_jobs) || 0,
    permanent_failure_jobs: Number(row?.permanent_failure_jobs) || 0,
    retry_units: Number(row?.retry_units) || 0,
    expired_or_deleted_result_jobs:
      Number(row?.expired_or_deleted_result_jobs) || 0,
    jobs_still_retrying: Number(row?.jobs_still_retrying) || 0,
  }
}

/** Failure-class histogram for terminal failures in window (seller diagnostics). */
export async function listFailureClassHistogramForSlugWindow(
  db: D1Database,
  slug: string,
  sinceModifier: string,
): Promise<{ failure_class: string | null; count: number }[]> {
  const res = await db
    .prepare(
      `SELECT failure_class, COUNT(*) as c
       FROM capability_async_jobs
       WHERE slug = ?
         AND status = 'failed'
         AND datetime(COALESCE(failed_at, updated_at)) >= datetime('now', ?)
       GROUP BY failure_class
       ORDER BY c DESC`,
    )
    .bind(slug, sinceModifier)
    .all<{ failure_class: string | null; c: number }>()
  return (res.results ?? []).map((r) => ({
    failure_class:
      r.failure_class != null && String(r.failure_class) !== ''
        ? String(r.failure_class)
        : null,
    count: Number(r.c) || 0,
  }))
}

/** Most recent failed job summary fields (seller diagnostics). */
export async function getMostRecentFailedJobSummaryForSlug(
  db: D1Database,
  slug: string,
): Promise<{
  id: string | null
  failed_at: string | null
  failure_class: string | null
  last_error_summary: string | null
  attempt_count: number
} | null> {
  const row = await db
    .prepare(
      `SELECT id, failed_at, failure_class, last_error_summary, attempt_count
       FROM capability_async_jobs
       WHERE slug = ? AND status = 'failed'
       ORDER BY datetime(COALESCE(failed_at, updated_at)) DESC
       LIMIT 1`,
    )
    .bind(slug)
    .first<Record<string, unknown>>()
  if (!row) return null
  return {
    id: row.id != null ? String(row.id) : null,
    failed_at: row.failed_at != null ? String(row.failed_at) : null,
    failure_class:
      row.failure_class != null && String(row.failure_class) !== ''
        ? String(row.failure_class)
        : null,
    last_error_summary:
      row.last_error_summary != null && String(row.last_error_summary) !== ''
        ? String(row.last_error_summary)
        : null,
    attempt_count: Number(row.attempt_count) || 0,
  }
}
