/**
 * Stable Phase 5 semantics for API + UI (explicit retention state).
 *
 * Phase 10.5: these helpers classify **job rows** (`capability_async_jobs`) — execution + result
 * retention — never `payment_attempts` status. See `CAPABILITY_PLATFORM.md`.
 */
export type ResultRetentionPublicState =
  | 'available'
  | 'expired'
  | 'deleted'
  | 'preview_only'
  | 'not_stored'

type JobRetentionFields = {
  status: string
  resultAvailable: number
  resultStorageKind: string | null
  resultPreview: string | null
  resultRetentionState: string | null
}

/**
 * Buyer-facing lifecycle for async (and poll) UX — execution vs retention kept distinct.
 * Maps to stable string keys for API + UI (Phase 9).
 */
export type BuyerCapabilityResultLifecycle =
  | 'execution_pending'
  | 'execution_running'
  | 'execution_retrying'
  | 'execution_failed'
  | 'result_available'
  | 'result_preview_only'
  | 'result_expired'
  | 'result_deleted'
  | 'result_not_stored'

export function deriveBuyerCapabilityResultLifecycle(
  job: JobRetentionFields,
): BuyerCapabilityResultLifecycle {
  if (job.status === 'failed') return 'execution_failed'
  if (job.status === 'retry_scheduled') return 'execution_retrying'
  if (job.status === 'pending') return 'execution_pending'
  if (job.status === 'running') return 'execution_running'
  if (job.status !== 'completed') {
    return 'execution_pending'
  }
  const rs = deriveResultRetentionPublicState(job)
  switch (rs) {
    case 'available':
      return 'result_available'
    case 'preview_only':
      return 'result_preview_only'
    case 'expired':
      return 'result_expired'
    case 'deleted':
      return 'result_deleted'
    default:
      return 'result_not_stored'
  }
}

export function deriveResultRetentionPublicState(
  job: JobRetentionFields,
): ResultRetentionPublicState {
  if (job.status !== 'completed') {
    return 'not_stored'
  }
  const explicit = job.resultRetentionState?.trim().toLowerCase()
  if (explicit === 'expired' || explicit === 'deleted') {
    return explicit
  }
  if (explicit === 'preview_only') {
    return 'preview_only'
  }
  if (explicit === 'not_stored') {
    return 'not_stored'
  }
  if (
    job.resultAvailable === 1 &&
    (job.resultStorageKind === 'd1_inline' || job.resultStorageKind === 'r2_object')
  ) {
    return 'available'
  }
  if (job.resultStorageKind === 'preview_only') {
    return 'preview_only'
  }
  if (
    job.resultPreview != null &&
    job.resultPreview !== '' &&
    job.resultAvailable === 0
  ) {
    return 'preview_only'
  }
  return 'not_stored'
}
