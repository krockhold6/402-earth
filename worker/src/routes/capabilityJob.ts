import { getAttemptById } from '../db/attempts'
import { getCapabilityJobById } from '../db/capabilityJobs'
import { getResourceBySlug } from '../db/resources'
import {
  buildBuyerOutcomeFromAsyncJob,
  asyncPollAndRetrievalUrls,
} from '../lib/capabilityBuyerOutcome'
import { buildNormalizedCapabilityJobResultMetadata } from '../lib/capabilityResultMetadata'
import { json, notFound } from '../lib/response'
import type { Env } from '../types/env'

/**
 * GET — poll async capability job status and summary.
 *
 * `attempt_id` is the **payment attempt** (commercial anchor). Job `status` is **execution** only.
 */
export async function handleGetCapabilityJob(
  env: Env,
  jobId: string,
): Promise<Response> {
  const job = await getCapabilityJobById(env.DB, jobId)
  if (!job) {
    return notFound('Job not found')
  }

  const attempt = await getAttemptById(env.DB, job.attemptId)
  const attemptOk = attempt != null && attempt.status === 'paid'

  const resource = await getResourceBySlug(env.DB, job.slug)
  const capSummary =
    resource && resource.sellType === 'capability'
      ? {
          slug: resource.slug,
          capability_name: resource.capabilityName ?? resource.label,
          delivery_mode: resource.deliveryMode,
          http_method: resource.httpMethod,
          endpoint_host: resource.capabilityOriginHost,
          origin_trust_status: resource.capabilityOriginTrust,
        }
      : null

  let providerMeta: unknown = null
  if (job.providerMetadataJson) {
    try {
      providerMeta = JSON.parse(job.providerMetadataJson) as unknown
    } catch {
      providerMeta = null
    }
  }

  const terminal = job.status === 'completed' || job.status === 'failed'
  const meta = buildNormalizedCapabilityJobResultMetadata(env, job)
  const retrievalUrl = meta.retrieval_url

  const willRetry = job.status === 'retry_scheduled'
  const permanentFailure = job.status === 'failed'
  const resultLifecycle = meta.result_lifecycle
  const { poll_url, retrieval_url: pollRetrieval } = asyncPollAndRetrievalUrls(
    env,
    job,
    job.id,
  )
  const outcomeSummary = buildBuyerOutcomeFromAsyncJob(
    job,
    poll_url,
    pollRetrieval ?? retrievalUrl,
  )

  return json({
    ok: true,
    id: job.id,
    slug: job.slug,
    attempt_id: job.attemptId,
    status: job.status,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    started_at: job.executionStartedAt,
    last_attempt_started_at: job.lastAttemptStartedAt,
    completed_at: job.executionCompletedAt,
    failed_at: job.failedAt,
    attempt_count: job.attemptCount,
    max_attempts: job.maxAttempts,
    next_retry_at: job.nextRetryAt,
    failure_class: job.failureClass,
    will_retry: willRetry,
    permanent_failure: permanentFailure,
    result_http_status: job.resultHttpStatus,
    result_hash: job.resultHash,
    result_preview: job.resultPreview,
    result: {
      preview_available: meta.preview_available,
      full_result_available: meta.full_result_available,
      retention_state: meta.retention_state,
      storage_kind: meta.storage_kind,
      content_type: job.resultContentType,
      size_bytes: job.resultSizeBytes,
      expires_at: meta.expires_at,
      retrieval_url: retrievalUrl,
    },
    /** Phase 9 — stable buyer semantics (execution vs result). */
    buyer: {
      result_lifecycle: resultLifecycle,
      execution_status: meta.execution_status,
      retention_state: meta.retention_state,
      preview_available: meta.preview_available,
      full_result_available: meta.full_result_available,
      retrieval_url: retrievalUrl,
      expires_at: meta.expires_at,
      /** Phase 10 — concise contract copy; mirrors `capability_buyer_outcome` on paid payload. */
      result_status_code: outcomeSummary.result_status_code,
      result_status_message: outcomeSummary.result_status_message,
    },
    last_error_summary: job.lastErrorSummary,
    provider_metadata: providerMeta,
    capability: capSummary,
    attempt_verified_paid: attemptOk,
    poll: terminal ? null : { interval_ms_suggested: 2500 },
  })
}
