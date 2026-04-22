import { nowIso } from '../lib/time'

/** Inline full body in D1 when under this size (honest cap). */
export const RESULT_INLINE_MAX_BYTES = 256 * 1024

/** Default retention for stored results (ISO expiry). */
export function defaultResultExpiresAt(): string {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
}

export async function insertCapabilityJobResult(
  db: D1Database,
  input: {
    jobId: string
    bodyText: string
    contentType: string
    storageKind: 'd1_inline'
    expiresAt: string | null
  },
): Promise<void> {
  const size = new TextEncoder().encode(input.bodyText).byteLength
  const t = nowIso()
  await db
    .prepare(
      `INSERT INTO capability_job_results (
        job_id, body_text, content_type, size_bytes, storage_kind, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.jobId,
      input.bodyText,
      input.contentType,
      size,
      input.storageKind,
      t,
      input.expiresAt,
    )
    .run()
}

export async function getCapabilityJobResult(
  db: D1Database,
  jobId: string,
): Promise<{
  bodyText: string
  contentType: string
  sizeBytes: number
  expiresAt: string | null
} | null> {
  const row = await db
    .prepare(
      `SELECT body_text, content_type, size_bytes, expires_at FROM capability_job_results WHERE job_id = ?`,
    )
    .bind(jobId)
    .first<{
      body_text: string
      content_type: string
      size_bytes: number
      expires_at: string | null
    }>()
  if (!row) return null
  const exp = row.expires_at
  if (exp != null && exp !== '' && Date.parse(exp) < Date.now()) {
    return null
  }
  return {
    bodyText: String(row.body_text),
    contentType: String(row.content_type),
    sizeBytes: Number(row.size_bytes) || 0,
    expiresAt: exp != null && exp !== '' ? String(exp) : null,
  }
}

/** Job ids whose inline D1 row is past expiry (for cleanup batch). */
export async function listExpiredInlineJobIds(
  db: D1Database,
  beforeIso: string,
): Promise<string[]> {
  const res = await db
    .prepare(
      `SELECT job_id FROM capability_job_results
       WHERE expires_at IS NOT NULL AND expires_at != '' AND expires_at < ?`,
    )
    .bind(beforeIso)
    .all<{ job_id: string }>()
  return (res.results ?? []).map((r) => String(r.job_id))
}

export async function deleteCapabilityJobResultByJobId(
  db: D1Database,
  jobId: string,
): Promise<boolean> {
  const res = await db
    .prepare(`DELETE FROM capability_job_results WHERE job_id = ?`)
    .bind(jobId)
    .run()
  return (res.meta?.changes ?? 0) > 0
}
