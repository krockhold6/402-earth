import type { CapabilityAsyncJobRow } from '../db/capabilityJobs'
import {
  deriveBuyerCapabilityResultLifecycle,
  type BuyerCapabilityResultLifecycle,
} from './capabilityResultSemantics'
import { buildNormalizedCapabilityJobResultMetadata } from './capabilityResultMetadata'
import { apiPublicBaseFromEnv } from './publicUrl'
import type { Env } from '../types/env'

/** Poll + optional full-result retrieval URL for an async job (matches capability-job GET). */
export function asyncPollAndRetrievalUrls(
  env: Env,
  job: CapabilityAsyncJobRow | null,
  jobId: string | null,
): { poll_url: string | null; retrieval_url: string | null } {
  const base = apiPublicBaseFromEnv(env)
  const poll_url =
    jobId != null && jobId !== ''
      ? `${base}/api/capability-job/${encodeURIComponent(jobId)}`
      : null
  const retrieval_url =
    job != null
      ? buildNormalizedCapabilityJobResultMetadata(env, job).retrieval_url
      : null
  return { poll_url, retrieval_url }
}

/** Phase 10 — stable codes for clients; keep messages short and honest (EN). */
export type CapabilityBuyerOutcomeCode =
  | 'OUTCOME_ASYNC_QUEUED'
  | 'OUTCOME_ASYNC_RUNNING'
  | 'OUTCOME_ASYNC_RETRYING'
  | 'OUTCOME_ASYNC_FAILED'
  | 'OUTCOME_ASYNC_RESULT_AVAILABLE'
  | 'OUTCOME_ASYNC_RESULT_PREVIEW'
  | 'OUTCOME_ASYNC_RESULT_EXPIRED'
  | 'OUTCOME_ASYNC_RESULT_DELETED'
  | 'OUTCOME_ASYNC_RESULT_NOT_STORED'
  | 'OUTCOME_PROTECTED_READY'
  | 'OUTCOME_DIRECT_SUCCEEDED'
  | 'OUTCOME_DIRECT_PREVIEW_ONLY'
  | 'OUTCOME_DIRECT_FAILED'
  | 'OUTCOME_DIRECT_COMPLETED_WITH_ERROR'
  | 'OUTCOME_UNKNOWN'

export type CapabilityBuyerOutcomeSummary = {
  delivery_mode: 'direct' | 'protected' | 'async'
  async_job_id: string | null
  execution_status: string
  result_lifecycle: BuyerCapabilityResultLifecycle | string
  result_status_code: CapabilityBuyerOutcomeCode
  result_status_message: string
  poll_url?: string | null
  retrieval_url?: string | null
}

function msgForAsyncLifecycle(lc: BuyerCapabilityResultLifecycle): {
  code: CapabilityBuyerOutcomeCode
  message: string
} {
  switch (lc) {
    case 'execution_pending':
      return {
        code: 'OUTCOME_ASYNC_QUEUED',
        message: 'Async run is queued; poll until it starts.',
      }
    case 'execution_running':
      return {
        code: 'OUTCOME_ASYNC_RUNNING',
        message: 'Async run is in progress.',
      }
    case 'execution_retrying':
      return {
        code: 'OUTCOME_ASYNC_RETRYING',
        message: 'Async run is retrying after a transient issue.',
      }
    case 'execution_failed':
      return {
        code: 'OUTCOME_ASYNC_FAILED',
        message: 'Async run failed; see job details for a safe summary.',
      }
    case 'result_available':
      return {
        code: 'OUTCOME_ASYNC_RESULT_AVAILABLE',
        message: 'Run finished; full stored result can be retrieved while retention allows.',
      }
    case 'result_preview_only':
      return {
        code: 'OUTCOME_ASYNC_RESULT_PREVIEW',
        message: 'Run finished; only a preview is retained.',
      }
    case 'result_expired':
      return {
        code: 'OUTCOME_ASYNC_RESULT_EXPIRED',
        message: 'Run finished; stored full result has expired.',
      }
    case 'result_deleted':
      return {
        code: 'OUTCOME_ASYNC_RESULT_DELETED',
        message: 'Run finished; stored result was removed.',
      }
    case 'result_not_stored':
      return {
        code: 'OUTCOME_ASYNC_RESULT_NOT_STORED',
        message: 'Run finished; no durable full result is stored.',
      }
    default:
      return {
        code: 'OUTCOME_UNKNOWN',
        message: 'Outcome state could not be classified.',
      }
  }
}

export function buildBuyerOutcomeFromAsyncJob(
  job: CapabilityAsyncJobRow,
  pollUrl: string | null,
  retrievalUrl: string | null,
): CapabilityBuyerOutcomeSummary {
  const lc = deriveBuyerCapabilityResultLifecycle({
    status: job.status,
    resultAvailable: job.resultAvailable,
    resultStorageKind: job.resultStorageKind,
    resultPreview: job.resultPreview,
    resultRetentionState: job.resultRetentionState,
  })
  const { code, message } = msgForAsyncLifecycle(
    lc as BuyerCapabilityResultLifecycle,
  )
  return {
    delivery_mode: 'async',
    async_job_id: job.id,
    execution_status: job.status,
    result_lifecycle: lc,
    result_status_code: code,
    result_status_message: message,
    poll_url: pollUrl,
    retrieval_url: retrievalUrl,
  }
}

export function buildBuyerOutcomeProtected(
  proxyUrl: string,
): CapabilityBuyerOutcomeSummary {
  return {
    delivery_mode: 'protected',
    async_job_id: null,
    execution_status: 'ready_via_proxy',
    result_lifecycle: 'protected_ready',
    result_status_code: 'OUTCOME_PROTECTED_READY',
    result_status_message:
      'Payment confirmed. Open the proxy URL to run the capability server-side.',
    retrieval_url: proxyUrl,
    poll_url: null,
  }
}

export function buildBuyerOutcomeDirect(input: {
  executionStatus: string
  hasFullBody: boolean
  hasPreviewOnly: boolean
}): CapabilityBuyerOutcomeSummary {
  if (input.executionStatus === 'failed') {
    return {
      delivery_mode: 'direct',
      async_job_id: null,
      execution_status: 'failed',
      result_lifecycle: 'sync_execution_failed',
      result_status_code: 'OUTCOME_DIRECT_FAILED',
      result_status_message:
        'Direct run failed before a successful response was returned.',
      poll_url: null,
      retrieval_url: null,
    }
  }
  if (input.hasFullBody) {
    return {
      delivery_mode: 'direct',
      async_job_id: null,
      execution_status: input.executionStatus,
      result_lifecycle: 'sync_result_available',
      result_status_code: 'OUTCOME_DIRECT_SUCCEEDED',
      result_status_message:
        'Direct run finished; full response body is included in your receipt payload.',
      poll_url: null,
      retrieval_url: null,
    }
  }
  if (input.hasPreviewOnly) {
    return {
      delivery_mode: 'direct',
      async_job_id: null,
      execution_status: input.executionStatus,
      result_lifecycle: 'sync_result_preview_only',
      result_status_code: 'OUTCOME_DIRECT_PREVIEW_ONLY',
      result_status_message:
        'Direct run finished; only a truncated preview is included inline.',
      poll_url: null,
      retrieval_url: null,
    }
  }
  if (input.executionStatus === 'completed_with_error') {
    return {
      delivery_mode: 'direct',
      async_job_id: null,
      execution_status: input.executionStatus,
      result_lifecycle: 'sync_completed_with_error',
      result_status_code: 'OUTCOME_DIRECT_COMPLETED_WITH_ERROR',
      result_status_message:
        'Direct run finished with a non-success HTTP outcome; see execution details.',
      poll_url: null,
      retrieval_url: null,
    }
  }
  return {
    delivery_mode: 'direct',
    async_job_id: null,
    execution_status: input.executionStatus,
    result_lifecycle: 'sync_result_available',
    result_status_code: 'OUTCOME_DIRECT_SUCCEEDED',
    result_status_message: 'Direct run finished.',
    poll_url: null,
    retrieval_url: null,
  }
}

export function buildBuyerOutcomeAsyncQueued(
  jobId: string | null,
  pollUrl: string | null,
): CapabilityBuyerOutcomeSummary {
  return {
    delivery_mode: 'async',
    async_job_id: jobId,
    execution_status: 'pending',
    result_lifecycle: 'execution_pending',
    result_status_code: 'OUTCOME_ASYNC_QUEUED',
    result_status_message:
      'Async job is queued or starting; poll for status until it completes or fails.',
    poll_url: pollUrl,
    retrieval_url: null,
  }
}
