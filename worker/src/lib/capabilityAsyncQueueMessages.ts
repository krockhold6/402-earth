/**
 * Phase 10.5 — Cloudflare Queue payload taxonomy for capability async control plane.
 *
 * Queues are **transport/orchestration only** — D1 remains canonical truth for job rows.
 * See `CAPABILITY_PLATFORM.md` and `capabilityAsyncQueue.ts`.
 */

export const CAPABILITY_ASYNC_QUEUE_VERSION = 1 as const

/** Primary: run one async capability job (claims via D1, executes fetch, persists result). */
export type CapabilityAsyncQueueRunJob = {
  v: typeof CAPABILITY_ASYNC_QUEUE_VERSION
  kind: 'run_job'
  job_id: string
  /** Observability only — not used for correctness. */
  reason?: string
}

/** Terminal seller notification after job reaches completed/failed (Resend + webhook). */
export type CapabilityAsyncQueueNotifyTerminal = {
  v: typeof CAPABILITY_ASYNC_QUEUE_VERSION
  kind: 'notify_terminal'
  job_id: string
  outcome: 'completed' | 'failed'
}

export type CapabilityAsyncQueueMessage =
  | CapabilityAsyncQueueRunJob
  | CapabilityAsyncQueueNotifyTerminal

export function isCapabilityAsyncQueueMessage(
  body: unknown,
): body is CapabilityAsyncQueueMessage {
  if (body === null || typeof body !== 'object') return false
  const o = body as Record<string, unknown>
  if (o.v !== CAPABILITY_ASYNC_QUEUE_VERSION) return false
  if (o.kind === 'run_job' && typeof o.job_id === 'string' && o.job_id.trim() !== '') {
    return true
  }
  if (
    o.kind === 'notify_terminal' &&
    typeof o.job_id === 'string' &&
    o.job_id.trim() !== '' &&
    (o.outcome === 'completed' || o.outcome === 'failed')
  ) {
    return true
  }
  return false
}
