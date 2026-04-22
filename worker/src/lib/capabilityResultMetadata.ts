/**
 * Phase 10.5 — Canonical normalized result metadata for async capability jobs.
 *
 * Single internal model for execution vs retention vs retrieval — buyer poll, seller history,
 * and diagnostics should derive from this shape where practical (additive refactors).
 *
 * Semantics:
 * - **execution_status** — D1 `capability_async_jobs.status` (job / execution event).
 * - **result_lifecycle** — buyer-facing union from execution + retention (not payment state).
 * - **attempt** (payment) is separate: use `attempt_id` on the job row only as a foreign key;
 *   never conflate `payment_attempts.status` with job execution status.
 */

import type { CapabilityAsyncJobRow } from '../db/capabilityJobs'
import {
  deriveBuyerCapabilityResultLifecycle,
  deriveResultRetentionPublicState,
  type BuyerCapabilityResultLifecycle,
  type ResultRetentionPublicState,
} from './capabilityResultSemantics'
import { apiPublicBaseFromEnv } from './publicUrl'
import type { Env } from '../types/env'

export type NormalizedCapabilityJobResultMetadata = {
  execution_status: string
  result_lifecycle: BuyerCapabilityResultLifecycle
  retention_state: ResultRetentionPublicState
  preview_available: boolean
  full_result_available: boolean
  retrieval_available: boolean
  retrieval_url: string | null
  storage_kind: string | null
  expires_at: string | null
  /** Distinct from execution failure — null when not applicable. */
  result_unavailable_reason:
    | null
    | 'execution_failed'
    | 'expired'
    | 'deleted'
    | 'preview_only'
    | 'not_stored'
}

export function buildNormalizedCapabilityJobResultMetadata(
  env: Env,
  job: CapabilityAsyncJobRow,
): NormalizedCapabilityJobResultMetadata {
  const retention_state = deriveResultRetentionPublicState(job)
  const fullStored =
    job.status === 'completed' &&
    retention_state === 'available' &&
    job.resultAvailable === 1 &&
    (job.resultStorageKind === 'd1_inline' ||
      job.resultStorageKind === 'r2_object')
  const base = apiPublicBaseFromEnv(env)
  const retrieval_url = fullStored
    ? `${base}/api/capability-job/${encodeURIComponent(job.id)}/result`
    : null

  const result_lifecycle = deriveBuyerCapabilityResultLifecycle(job)

  let result_unavailable_reason: NormalizedCapabilityJobResultMetadata['result_unavailable_reason'] =
    null
  if (job.status === 'failed') {
    result_unavailable_reason = 'execution_failed'
  } else if (job.status === 'completed') {
    if (retention_state === 'expired') result_unavailable_reason = 'expired'
    else if (retention_state === 'deleted') result_unavailable_reason = 'deleted'
    else if (retention_state === 'preview_only') {
      result_unavailable_reason = 'preview_only'
    } else if (retention_state === 'not_stored') {
      result_unavailable_reason = 'not_stored'
    }
  }

  return {
    execution_status: job.status,
    result_lifecycle,
    retention_state,
    preview_available: job.resultPreview != null && job.resultPreview !== '',
    full_result_available: Boolean(fullStored),
    retrieval_available: Boolean(retrieval_url),
    retrieval_url,
    storage_kind: job.resultStorageKind,
    expires_at: job.resultExpiresAt,
    result_unavailable_reason,
  }
}
