/**
 * Async capability job execution (Phase 3+10.5).
 *
 * **Attempt vs job:** `payment_attempts` = commercial/payment truth; `capability_async_jobs` =
 * execution truth. This module only mutates job rows and reads attempts to verify paid state.
 *
 * **Queue-first (Phase 10.5):** durable progression is driven by `CAPABILITY_ASYNC` messages
 * (`run_job`, `notify_terminal`). Cron performs recovery/cleanup and enqueues eligible work;
 * `waitUntil` is an optional accelerator only.
 */

import { insertCapabilityAuditEvent } from '../db/capabilityAudit'
import {
  getCapabilityJobById,
  markJobCompleted,
  markJobRetryScheduled,
  markJobTerminalFailed,
  tryMarkJobRunning,
} from '../db/capabilityJobs'
import {
  defaultResultExpiresAt,
  insertCapabilityJobResult,
  RESULT_INLINE_MAX_BYTES,
} from '../db/capabilityJobResults'
import { getResourceBySlug } from '../db/resources'
import { getAttemptById } from '../db/attempts'
import {
  classifyFetchFailure,
  retryDelayMsForAttempt,
} from './capabilityFailureClass'
import { gateCapabilityExecution } from './capabilityExecutionGate'
import {
  fetchCapabilityEndpoint,
  truncateResultPreview,
} from './capabilityExecutionFetch'
import {
  dispatchNotifyTerminalQueueFirst,
  enqueueCapabilityAsyncJobRun,
} from './capabilityAsyncQueue'
import { maybeApplyCapabilityAutoPauseAfterAsyncFailure } from './capabilityPolicy'
import { nowIso } from './time'
import type { Env } from '../types/env'

function safeFailureSummary(message: string): string {
  const t = message.trim()
  if (t.length > 240) return `${t.slice(0, 237)}…`
  return t || 'Execution failed'
}

function simpleResultHash(body: string, httpStatus: number): string {
  return `sha256:len:${body.length}:http:${httpStatus}`
}

/**
 * Runs one async capability job: claim → gate → fetch → persist.
 * Invoked from the **async queue consumer** (primary), optional `waitUntil` accelerator,
 * or cron fallback when the queue binding is absent.
 */
export async function runCapabilityAsyncJob(
  env: Env,
  jobId: string,
): Promise<void> {
  const clock = nowIso()
  const claimed = await tryMarkJobRunning(env.DB, jobId, clock, clock)
  if (!claimed) {
    return
  }

  const job = await getCapabilityJobById(env.DB, jobId)
  if (!job || job.status !== 'running') {
    return
  }

  await insertCapabilityAuditEvent(env.DB, {
    eventType: 'capability_job_started',
    slug: job.slug,
    jobId,
    actorScope: 'system',
    statusSummary: 'running',
  })

  const resource = await getResourceBySlug(env.DB, job.slug)
  if (!resource || resource.sellType !== 'capability') {
    await markJobTerminalFailed(env.DB, {
      id: jobId,
      failedAt: nowIso(),
      lastError: 'resource_missing_or_not_capability',
      lastErrorSummary: 'Capability configuration is no longer available.',
      failureClass: 'validation',
    })
    await insertCapabilityAuditEvent(env.DB, {
      eventType: 'capability_job_failed',
      slug: job.slug,
      jobId,
      actorScope: 'system',
      statusSummary: 'resource missing',
      metadata: { reason: 'resource_missing_or_not_capability' },
    })
    await dispatchNotifyTerminalQueueFirst(env, jobId, 'failed')
    await maybeApplyCapabilityAutoPauseAfterAsyncFailure(env, job.slug, 'validation')
    return
  }

  const attempt = await getAttemptById(env.DB, job.attemptId)
  if (!attempt || attempt.status !== 'paid') {
    await markJobTerminalFailed(env.DB, {
      id: jobId,
      failedAt: nowIso(),
      lastError: 'attempt_not_paid',
      lastErrorSummary: 'Payment was not confirmed for this job.',
      failureClass: 'validation',
    })
    await insertCapabilityAuditEvent(env.DB, {
      eventType: 'capability_job_failed',
      slug: job.slug,
      jobId,
      actorScope: 'system',
      statusSummary: 'attempt not paid',
    })
    await dispatchNotifyTerminalQueueFirst(env, jobId, 'failed')
    await maybeApplyCapabilityAutoPauseAfterAsyncFailure(env, job.slug, 'validation')
    return
  }

  await insertCapabilityAuditEvent(env.DB, {
    eventType: 'capability_execution_requested',
    slug: job.slug,
    jobId,
    actorScope: 'system',
    statusSummary: 'async job',
  })

  const gate = await gateCapabilityExecution(env, resource)
  if (!gate.ok) {
    await insertCapabilityAuditEvent(env.DB, {
      eventType: 'capability_execution_blocked',
      slug: job.slug,
      jobId,
      actorScope: 'system',
      statusSummary: gate.publicMessage,
      metadata: { code: gate.code },
    })
    await markJobTerminalFailed(env.DB, {
      id: jobId,
      failedAt: nowIso(),
      lastError: `gate:${gate.code}`,
      lastErrorSummary: gate.publicMessage,
      failureClass: 'trust',
    })
    await insertCapabilityAuditEvent(env.DB, {
      eventType: 'capability_job_failed',
      slug: job.slug,
      jobId,
      actorScope: 'system',
      statusSummary: 'gated',
      metadata: { code: gate.code },
    })
    await dispatchNotifyTerminalQueueFirst(env, jobId, 'failed')
    await maybeApplyCapabilityAutoPauseAfterAsyncFailure(env, job.slug, 'trust')
    return
  }

  await insertCapabilityAuditEvent(env.DB, {
    eventType: 'capability_execution_gated',
    slug: job.slug,
    jobId,
    actorScope: 'system',
    statusSummary: 'allowed',
    metadata: { trust: gate.trust },
  })

  const exec = await fetchCapabilityEndpoint(resource)
  const doneAt = nowIso()

  if (exec.error || !exec.ok) {
    const { failureClass, retryable } = classifyFetchFailure({
      httpStatus: exec.httpStatus,
      lastError: exec.error ?? null,
    })
    const canRetry =
      retryable &&
      job.attemptCount < job.maxAttempts

    if (canRetry) {
      const delayMs = retryDelayMsForAttempt(job.attemptCount)
      const nextRetryAt = new Date(Date.now() + delayMs).toISOString()
      await markJobRetryScheduled(env.DB, {
        id: jobId,
        updatedAt: doneAt,
        nextRetryAt,
        lastError: exec.error ?? `http_${exec.httpStatus}`,
        lastErrorSummary: exec.error
          ? safeFailureSummary(exec.error)
          : `Upstream returned HTTP ${exec.httpStatus}`,
        failureClass,
      })
      await insertCapabilityAuditEvent(env.DB, {
        eventType: 'capability_job_retried',
        slug: job.slug,
        jobId,
        actorScope: 'system',
        statusSummary: `retry at ${nextRetryAt}`,
        metadata: { attempt_count: job.attemptCount, failure_class: failureClass },
      })
      await enqueueCapabilityAsyncJobRun(env, jobId, {
        delayMs: delayMs,
        reason: 'retry_backoff',
      })
      return
    }

    await markJobTerminalFailed(env.DB, {
      id: jobId,
      failedAt: doneAt,
      lastError: exec.error ?? `http_${exec.httpStatus}`,
      lastErrorSummary: exec.error
        ? safeFailureSummary(exec.error)
        : `Upstream returned HTTP ${exec.httpStatus}`,
      failureClass,
    })
    await insertCapabilityAuditEvent(env.DB, {
      eventType: 'capability_job_failed',
      slug: job.slug,
      jobId,
      actorScope: 'system',
      statusSummary: 'terminal fetch failure',
      metadata: { failure_class: failureClass },
    })
    await dispatchNotifyTerminalQueueFirst(env, jobId, 'failed')
    await maybeApplyCapabilityAutoPauseAfterAsyncFailure(env, job.slug, failureClass)
    return
  }

  const bodyBytes = new TextEncoder().encode(exec.bodyText).byteLength
  const preview = truncateResultPreview(exec.bodyText)
  const hash = simpleResultHash(exec.bodyText, exec.httpStatus)
  const meta = JSON.stringify({
    delivery_mode: 'async',
    http_status: exec.httpStatus,
    ok: exec.ok,
  })

  let resultAvailable = false
  let storageKind: string | null = 'preview_only'
  let resultContentType: string | null = 'text/plain; charset=utf-8'
  let resultSizeBytes: number | null = bodyBytes
  let resultExpiresAt: string | null = null
  let resultStorageKey: string | null = null

  if (bodyBytes <= RESULT_INLINE_MAX_BYTES) {
    const exp = defaultResultExpiresAt()
    await insertCapabilityJobResult(env.DB, {
      jobId,
      bodyText: exec.bodyText,
      contentType: 'text/plain; charset=utf-8',
      storageKind: 'd1_inline',
      expiresAt: exp,
    })
    resultAvailable = true
    storageKind = 'd1_inline'
    resultExpiresAt = exp
    await insertCapabilityAuditEvent(env.DB, {
      eventType: 'capability_result_stored',
      slug: job.slug,
      jobId,
      actorScope: 'system',
      statusSummary: 'd1_inline',
      metadata: { size_bytes: bodyBytes },
    })
  } else if (env.CAPABILITY_RESULTS) {
    const exp = defaultResultExpiresAt()
    const key = `job/${jobId}/result.txt`
    await env.CAPABILITY_RESULTS.put(key, exec.bodyText, {
      httpMetadata: { contentType: 'text/plain; charset=utf-8' },
      customMetadata: {
        job_id: jobId,
        slug: job.slug,
        expires_at: exp,
      },
    })
    resultAvailable = true
    storageKind = 'r2_object'
    resultExpiresAt = exp
    resultStorageKey = key
    await insertCapabilityAuditEvent(env.DB, {
      eventType: 'capability_result_stored',
      slug: job.slug,
      jobId,
      actorScope: 'system',
      statusSummary: 'r2_object',
      metadata: { size_bytes: bodyBytes, storage_key: key },
    })
  }

  const resultRetentionState: string | null =
    bodyBytes <= RESULT_INLINE_MAX_BYTES || env.CAPABILITY_RESULTS
      ? 'available'
      : 'preview_only'

  await markJobCompleted(env.DB, {
    id: jobId,
    completedAt: doneAt,
    resultHash: hash,
    resultHttpStatus: exec.httpStatus,
    resultPreview: preview,
    providerMetadataJson: meta,
    resultAvailable,
    resultContentType,
    resultSizeBytes,
    resultStorageKind: storageKind,
    resultExpiresAt,
    resultStorageKey,
    resultRetentionState,
  })

  await insertCapabilityAuditEvent(env.DB, {
    eventType: 'capability_job_completed',
    slug: job.slug,
    jobId,
    actorScope: 'system',
    statusSummary: 'completed',
    metadata: {
      result_storage_kind: storageKind,
      http_status: exec.httpStatus,
    },
  })

  await dispatchNotifyTerminalQueueFirst(env, jobId, 'completed')
}

/**
 * After async job is persisted as `pending`: enqueue queue work (primary), then optionally
 * accelerate with `waitUntil` (non-authoritative duplicate run safe via D1 claim gate).
 */
export async function scheduleCapabilityAsyncJob(
  ctx: ExecutionContext | undefined,
  env: Env,
  jobId: string,
): Promise<void> {
  await enqueueCapabilityAsyncJobRun(env, jobId, { reason: 'post_payment' })
  if (!ctx?.waitUntil) {
    return
  }
  ctx.waitUntil(
    runCapabilityAsyncJob(env, jobId).catch((e) => {
      console.log(
        JSON.stringify({
          source: 'capability_async_job_waituntil',
          jobId,
          error: e instanceof Error ? e.message : 'unknown',
        }),
      )
    }),
  )
}
