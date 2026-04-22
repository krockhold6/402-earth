import { insertCapabilityAuditEvent } from '../db/capabilityAudit'
import { deleteCapabilityJobResultByJobId } from '../db/capabilityJobResults'
import {
  listJobsWithExpiredFullResults,
  markJobFullResultExpired,
} from '../db/capabilityJobs'
import { nowIso } from './time'
import type { Env } from '../types/env'

/**
 * Cron-driven cleanup for expired D1 inline + R2 full results (Phase 5).
 */
export async function processCapabilityResultRetentionCleanup(
  env: Env,
  input: { limit: number },
): Promise<{ cleaned: number }> {
  const t = nowIso()
  const rows = await listJobsWithExpiredFullResults(env.DB, t, input.limit)
  for (const row of rows) {
    if (row.result_storage_kind === 'd1_inline') {
      await deleteCapabilityJobResultByJobId(env.DB, row.id)
    } else if (
      row.result_storage_kind === 'r2_object' &&
      row.result_storage_key &&
      env.CAPABILITY_RESULTS
    ) {
      try {
        await env.CAPABILITY_RESULTS.delete(row.result_storage_key)
      } catch {
        /* best-effort; metadata still marked expired */
      }
    }
    await markJobFullResultExpired(env.DB, row.id, t, 'expired')
    await insertCapabilityAuditEvent(env.DB, {
      eventType: 'capability_result_expired',
      slug: row.slug,
      jobId: row.id,
      actorScope: 'system',
      statusSummary: 'full result no longer available',
      metadata: {
        storage_kind: row.result_storage_kind,
        also_deleted: true,
      },
    })
    await insertCapabilityAuditEvent(env.DB, {
      eventType: 'capability_result_deleted',
      slug: row.slug,
      jobId: row.id,
      actorScope: 'system',
      statusSummary: 'storage removed after expiry',
      metadata: { storage_kind: row.result_storage_kind },
    })
  }
  return { cleaned: rows.length }
}
