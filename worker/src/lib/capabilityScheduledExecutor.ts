import {
  listEligibleCapabilityJobIds,
  recoverStaleRunningJobs,
} from '../db/capabilityJobs'
import { enqueueCapabilityAsyncJobRun } from './capabilityAsyncQueue'
import { processCapabilityResultRetentionCleanup } from './capabilityResultCleanup'
import { nowIso } from './time'
import { runCapabilityAsyncJob } from './capabilityAsyncExecutor'
import type { Env } from '../types/env'

const STALE_RUNNING_MS = 15 * 60 * 1000
const BATCH_LIMIT = 15
const RESULT_CLEANUP_LIMIT = 25

/**
 * Cron / scheduled worker — **secondary** to the async queue (Phase 10.5).
 *
 * Responsibilities:
 * - Recover stale `running` jobs into D1 `pending` (truth repair).
 * - Retention cleanup / reconciliation against D1 + R2.
 * - Enqueue eligible pending/retry jobs for the primary queue consumer; if `CAPABILITY_ASYNC`
 *   is not bound (local/tests), fall back to direct `runCapabilityAsyncJob` execution.
 */
export async function processCapabilityJobQueue(env: Env): Promise<void> {
  const now = nowIso()
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MS).toISOString()
  await recoverStaleRunningJobs(env.DB, staleBefore, now)

  await processCapabilityResultRetentionCleanup(env, {
    limit: RESULT_CLEANUP_LIMIT,
  })

  const ids = await listEligibleCapabilityJobIds(env.DB, {
    nowIso: now,
    limit: BATCH_LIMIT,
  })

  for (const id of ids) {
    try {
      const enqueued = await enqueueCapabilityAsyncJobRun(env, id, {
        reason: 'cron_eligible_sweep',
      })
      if (!enqueued) {
        await runCapabilityAsyncJob(env, id)
      }
    } catch (e) {
      console.log(
        JSON.stringify({
          source: 'capability_scheduled_executor',
          jobId: id,
          error: e instanceof Error ? e.message : 'unknown',
        }),
      )
    }
  }
}
