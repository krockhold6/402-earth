/**
 * Phase 10.5 — Queue-first async capability execution.
 *
 * - **Primary durable progression**: messages on `CAPABILITY_ASYNC` (run_job, notify_terminal).
 * - **Cron (`processCapabilityJobQueue`)**: stale recovery, retention cleanup, enqueue eligible
 *   jobs when the queue binding exists (otherwise direct `runCapabilityAsyncJob` fallback).
 * - **waitUntil** (optional): accelerator only; safe to duplicate enqueue + waitUntil because
 *   `tryMarkJobRunning` is the single-writer gate on D1.
 *
 * D1 owns job truth; the queue never replaces D1 state.
 */

import { dispatchAsyncCapabilityTerminalNotification } from './capabilityAsyncNotifications'
import {
  CAPABILITY_ASYNC_QUEUE_VERSION,
  type CapabilityAsyncQueueMessage,
  isCapabilityAsyncQueueMessage,
} from './capabilityAsyncQueueMessages'
import type { Env } from '../types/env'

const MAX_DELAY_SECONDS = 86400

function clampDelaySeconds(ms: number): number {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return Math.min(MAX_DELAY_SECONDS, s)
}

/**
 * Enqueue async job execution. Returns false when queue binding is absent (cron-only / tests).
 */
export async function enqueueCapabilityAsyncJobRun(
  env: Env,
  jobId: string,
  opts?: { delayMs?: number; reason?: string },
): Promise<boolean> {
  const q = env.CAPABILITY_ASYNC
  if (!q) return false
  const body: Extract<CapabilityAsyncQueueMessage, { kind: 'run_job' }> = {
    v: CAPABILITY_ASYNC_QUEUE_VERSION,
    kind: 'run_job',
    job_id: jobId,
    reason: opts?.reason,
  }
  const delaySeconds =
    opts?.delayMs != null && opts.delayMs > 0
      ? clampDelaySeconds(opts.delayMs)
      : undefined
  try {
    await q.send(body, delaySeconds != null ? { delaySeconds } : undefined)
    return true
  } catch (e) {
    console.log(
      JSON.stringify({
        source: 'capability_async_queue_send',
        kind: 'run_job',
        job_id: jobId,
        error: e instanceof Error ? e.message : 'send_failed',
      }),
    )
    return false
  }
}

/**
 * Enqueue terminal notification dispatch (email/webhook + D1 delivery rows).
 */
export async function enqueueCapabilityAsyncNotifyTerminal(
  env: Env,
  jobId: string,
  outcome: 'completed' | 'failed',
): Promise<boolean> {
  const q = env.CAPABILITY_ASYNC
  if (!q) return false
  try {
    await q.send({
      v: CAPABILITY_ASYNC_QUEUE_VERSION,
      kind: 'notify_terminal',
      job_id: jobId,
      outcome,
    })
    return true
  } catch (e) {
    console.log(
      JSON.stringify({
        source: 'capability_async_queue_send',
        kind: 'notify_terminal',
        job_id: jobId,
        outcome,
        error: e instanceof Error ? e.message : 'send_failed',
      }),
    )
    return false
  }
}

/**
 * Prefer queue for terminal notifications; fall back to inline dispatch if queue is unbound.
 */
export async function dispatchNotifyTerminalQueueFirst(
  env: Env,
  jobId: string,
  outcome: 'completed' | 'failed',
): Promise<void> {
  const ok = await enqueueCapabilityAsyncNotifyTerminal(env, jobId, outcome)
  if (!ok) {
    await dispatchAsyncCapabilityTerminalNotification(env, { jobId, outcome })
  }
}

type QueueMessageHandle = {
  readonly id: string
  readonly body: unknown
  ack(): void
  retry(): void
}

export async function handleCapabilityAsyncQueueBatch(
  batch: { messages: readonly QueueMessageHandle[] },
  env: Env,
): Promise<void> {
  for (const message of batch.messages) {
    const body = message.body
    if (!isCapabilityAsyncQueueMessage(body)) {
      console.log(
        JSON.stringify({
          source: 'capability_async_queue',
          error: 'invalid_message_shape',
          id: message.id,
        }),
      )
      message.ack()
      continue
    }
    try {
      if (body.kind === 'run_job') {
        const { runCapabilityAsyncJob } = await import('./capabilityAsyncExecutor')
        await runCapabilityAsyncJob(env, body.job_id)
      } else {
        await dispatchAsyncCapabilityTerminalNotification(env, {
          jobId: body.job_id,
          outcome: body.outcome,
        })
      }
      message.ack()
    } catch (e) {
      console.log(
        JSON.stringify({
          source: 'capability_async_queue',
          kind: body.kind,
          job_id: body.job_id,
          error: e instanceof Error ? e.message : 'unknown',
        }),
      )
      message.retry()
    }
  }
}
