import {
  getCapabilityNotificationDeliveryById,
  insertCapabilityNotificationDelivery,
  markCapabilityNotificationDeliveryFinished,
} from '../db/capabilityNotificationDeliveries'
import type { CapabilityAsyncJobRow } from '../db/capabilityJobs'
import { getCapabilityJobById } from '../db/capabilityJobs'
import { getResourceBySlug } from '../db/resources'
import type { ResourceDefinition } from '../types/resource'
import { deriveResultRetentionPublicState } from './capabilityResultSemantics'
import { apiPublicBaseFromEnv } from './publicUrl'
import { nowIso } from './time'
import type { Env } from '../types/env'

function safeJsonStringify(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return '{}'
  }
}

async function sendEmailViaResend(
  env: Env,
  input: {
    to: string
    subject: string
    html: string
  },
): Promise<void> {
  const apiKey = env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('Email provider not configured')
  }
  const from =
    env.RESEND_FROM?.trim() || '402 <onboarding@resend.dev>'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  })
  if (res.ok) return
  let detail = ''
  try {
    const j = (await res.json()) as { message?: string }
    detail = j.message?.trim() ?? ''
  } catch {
    /* ignore */
  }
  throw new Error(detail || `Resend HTTP ${res.status}`)
}

type CapabilityResourceRow = ResourceDefinition & { sellType: 'capability' }

function buildAsyncTerminalPayload(
  env: Env,
  job: CapabilityAsyncJobRow,
  resource: CapabilityResourceRow,
  outcome: 'completed' | 'failed',
): Record<string, unknown> {
  const retention = deriveResultRetentionPublicState(job)
  const base = apiPublicBaseFromEnv(env)
  const retrievalHint =
    outcome === 'completed' &&
    retention === 'available' &&
    (job.resultStorageKind === 'd1_inline' ||
      job.resultStorageKind === 'r2_object')
      ? `${base}/api/capability-job/${encodeURIComponent(job.id)}/result`
      : null
  return {
    event:
      outcome === 'completed' ? 'async_job_completed' : 'async_job_failed',
    slug: job.slug,
    capability_name: resource.capabilityName ?? resource.label,
    job_id: job.id,
    outcome,
    result_retention: retention,
    result_preview_available: Boolean(
      job.resultPreview != null && job.resultPreview !== '',
    ),
    retrieval_url: retrievalHint,
    failure_summary:
      outcome === 'failed' ? job.lastErrorSummary ?? null : null,
    completed_at: job.executionCompletedAt,
    failed_at: job.failedAt,
  }
}

/**
 * Phase 10 — seller-initiated ping; records one delivery row per attempted channel.
 * Does not require capabilityNotifyEnabled (tests destination wiring only).
 */
export async function dispatchCapabilityNotificationTest(
  env: Env,
  resource: CapabilityResourceRow,
): Promise<{
  ok: boolean
  results: {
    channel: string
    delivery_id: string
    status: string
    error_message: string | null
  }[]
  error?: string
}> {
  const email = resource.capabilityNotifyEmail?.trim() ?? ''
  const webhook = resource.capabilityNotifyWebhookUrl?.trim() ?? ''
  const wantEmail =
    resource.capabilityNotifyEmailEnabled && email.length > 0
  const wantWebhook =
    resource.capabilityNotifyWebhookEnabled && webhook.length > 0
  if (!wantEmail && !wantWebhook) {
    return {
      ok: false,
      results: [],
      error:
        'No notification channel is both enabled and configured (email address or webhook URL).',
    }
  }

  const results: {
    channel: string
    delivery_id: string
    status: string
    error_message: string | null
  }[] = []

  const testPayload = {
    event: 'notification_test',
    slug: resource.slug,
    capability_name: resource.capabilityName ?? resource.label,
    sent_at: nowIso(),
  }

  if (wantEmail) {
    const id = await insertCapabilityNotificationDelivery(env.DB, {
      slug: resource.slug,
      jobId: null,
      eventType: 'notification_test',
      channel: 'email',
      status: 'pending',
      metadata: { channel: 'email' },
    })
    const attemptedAt = nowIso()
    try {
      const subject = `402 — Notification test: ${resource.capabilityName ?? resource.slug}`
      const html = `<p><strong>Test notification</strong></p>
<p>Capability: ${escapeHtml(resource.capabilityName ?? resource.label)} (${escapeHtml(resource.slug)})</p>
<p>If you received this, email delivery is working.</p>
<p style="color:#666;font-size:12px">402.earth capability notification</p>`
      await sendEmailViaResend(env, { to: email, subject, html })
      await markCapabilityNotificationDeliveryFinished(env.DB, id, {
        status: 'delivered',
        attemptedAt,
        completedAt: nowIso(),
        errorMessage: null,
      })
      results.push({
        channel: 'email',
        delivery_id: id,
        status: 'delivered',
        error_message: null,
      })
    } catch (e) {
      const err = e instanceof Error ? e.message : 'email failed'
      await markCapabilityNotificationDeliveryFinished(env.DB, id, {
        status: 'failed',
        attemptedAt,
        completedAt: nowIso(),
        errorMessage: err,
      })
      results.push({
        channel: 'email',
        delivery_id: id,
        status: 'failed',
        error_message: err,
      })
    }
  }

  if (wantWebhook) {
    const id = await insertCapabilityNotificationDelivery(env.DB, {
      slug: resource.slug,
      jobId: null,
      eventType: 'notification_test',
      channel: 'webhook',
      status: 'pending',
      metadata: { channel: 'webhook' },
    })
    const attemptedAt = nowIso()
    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': '402-earth-capability-webhook/1',
        },
        body: safeJsonStringify(testPayload),
      })
      if (!res.ok) {
        throw new Error(`Webhook HTTP ${res.status}`)
      }
      await markCapabilityNotificationDeliveryFinished(env.DB, id, {
        status: 'delivered',
        attemptedAt,
        completedAt: nowIso(),
        errorMessage: null,
      })
      results.push({
        channel: 'webhook',
        delivery_id: id,
        status: 'delivered',
        error_message: null,
      })
    } catch (e) {
      const err = e instanceof Error ? e.message : 'webhook failed'
      await markCapabilityNotificationDeliveryFinished(env.DB, id, {
        status: 'failed',
        attemptedAt,
        completedAt: nowIso(),
        errorMessage: err,
      })
      results.push({
        channel: 'webhook',
        delivery_id: id,
        status: 'failed',
        error_message: err,
      })
    }
  }

  const anyOk = results.some((r) => r.status === 'delivered')
  return {
    ok: anyOk,
    results,
    error: anyOk
      ? undefined
      : 'All configured test channels failed; see delivery rows for errors.',
  }
}

/**
 * Phase 10 — retry a single failed delivery when the underlying event can still be sent honestly.
 * Inserts a new delivery row (audit trail), then attempts the same channel again.
 */
export async function retryFailedCapabilityNotificationDelivery(
  env: Env,
  input: {
    slug: string
    prevDeliveryId: string
    resource: CapabilityResourceRow
  },
): Promise<
  | {
      ok: true
      new_delivery_id: string
      status: 'delivered' | 'failed'
      error_message: string | null
    }
  | { ok: false; code: string; message: string; httpStatus: number }
> {
  const prev = await getCapabilityNotificationDeliveryById(
    env.DB,
    input.prevDeliveryId,
  )
  if (!prev || prev.slug !== input.slug) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'Delivery not found.',
      httpStatus: 404,
    }
  }
  if (prev.status !== 'failed') {
    return {
      ok: false,
      code: 'RETRY_NOT_FAILED',
      message: 'Only failed deliveries can be retried.',
      httpStatus: 400,
    }
  }
  if (prev.channel !== 'email' && prev.channel !== 'webhook') {
    return {
      ok: false,
      code: 'UNSUPPORTED_CHANNEL',
      message: 'Unknown channel on delivery row.',
      httpStatus: 400,
    }
  }

  const email = input.resource.capabilityNotifyEmail?.trim() ?? ''
  const webhook = input.resource.capabilityNotifyWebhookUrl?.trim() ?? ''
  const emailReady =
    input.resource.capabilityNotifyEmailEnabled && email.length > 0
  const webhookReady =
    input.resource.capabilityNotifyWebhookEnabled && webhook.length > 0

  if (prev.channel === 'email' && !emailReady) {
    return {
      ok: false,
      code: 'CHANNEL_NOT_CONFIGURED',
      message:
        'Email channel is not enabled or the address is empty; fix configuration before retry.',
      httpStatus: 409,
    }
  }
  if (prev.channel === 'webhook' && !webhookReady) {
    return {
      ok: false,
      code: 'CHANNEL_NOT_CONFIGURED',
      message:
        'Webhook channel is not enabled or the URL is empty; fix configuration before retry.',
      httpStatus: 409,
    }
  }

  if (prev.event_type === 'notification_test') {
    const testPayload = {
      event: 'notification_test',
      slug: input.resource.slug,
      capability_name: input.resource.capabilityName ?? input.resource.label,
      sent_at: nowIso(),
      retry_of: prev.id,
    }
    const id = await insertCapabilityNotificationDelivery(env.DB, {
      slug: input.resource.slug,
      jobId: null,
      eventType: 'notification_test',
      channel: prev.channel,
      status: 'pending',
      metadata: { channel: prev.channel, retry_of: prev.id },
    })
    const attemptedAt = nowIso()
    if (prev.channel === 'email') {
      try {
        const subject = `402 — Notification test (retry): ${input.resource.capabilityName ?? input.resource.slug}`
        const html = `<p><strong>Test notification (retry)</strong></p>
<p>Capability: ${escapeHtml(input.resource.capabilityName ?? input.resource.label)} (${escapeHtml(input.resource.slug)})</p>
<p style="color:#666;font-size:12px">402.earth capability notification</p>`
        await sendEmailViaResend(env, { to: email, subject, html })
        await markCapabilityNotificationDeliveryFinished(env.DB, id, {
          status: 'delivered',
          attemptedAt,
          completedAt: nowIso(),
          errorMessage: null,
        })
        return {
          ok: true,
          new_delivery_id: id,
          status: 'delivered',
          error_message: null,
        }
      } catch (e) {
        const err = e instanceof Error ? e.message : 'email failed'
        await markCapabilityNotificationDeliveryFinished(env.DB, id, {
          status: 'failed',
          attemptedAt,
          completedAt: nowIso(),
          errorMessage: err,
        })
        return {
          ok: true,
          new_delivery_id: id,
          status: 'failed',
          error_message: err,
        }
      }
    }
    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': '402-earth-capability-webhook/1',
        },
        body: safeJsonStringify(testPayload),
      })
      if (!res.ok) {
        throw new Error(`Webhook HTTP ${res.status}`)
      }
      await markCapabilityNotificationDeliveryFinished(env.DB, id, {
        status: 'delivered',
        attemptedAt,
        completedAt: nowIso(),
        errorMessage: null,
      })
      return {
        ok: true,
        new_delivery_id: id,
        status: 'delivered',
        error_message: null,
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : 'webhook failed'
      await markCapabilityNotificationDeliveryFinished(env.DB, id, {
        status: 'failed',
        attemptedAt,
        completedAt: nowIso(),
        errorMessage: err,
      })
      return {
        ok: true,
        new_delivery_id: id,
        status: 'failed',
        error_message: err,
      }
    }
  }

  if (
    prev.event_type !== 'async_job_completed' &&
    prev.event_type !== 'async_job_failed'
  ) {
    return {
      ok: false,
      code: 'RETRY_UNSUPPORTED',
      message: 'This delivery type cannot be retried.',
      httpStatus: 400,
    }
  }

  if (!prev.job_id) {
    return {
      ok: false,
      code: 'RETRY_NO_JOB',
      message: 'Delivery has no job id; cannot retry.',
      httpStatus: 400,
    }
  }

  const job = await getCapabilityJobById(env.DB, prev.job_id)
  if (!job || job.slug !== input.slug) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'Related job not found.',
      httpStatus: 404,
    }
  }

  const wantOutcome: 'completed' | 'failed' =
    prev.event_type === 'async_job_completed' ? 'completed' : 'failed'
  if (wantOutcome === 'completed' && job.status !== 'completed') {
    return {
      ok: false,
      code: 'JOB_STATE_CHANGED',
      message:
        'Job is no longer in completed state; retry would not be the same notification.',
      httpStatus: 409,
    }
  }
  if (wantOutcome === 'failed' && job.status !== 'failed') {
    return {
      ok: false,
      code: 'JOB_STATE_CHANGED',
      message:
        'Job is no longer in failed state; retry would not be the same notification.',
      httpStatus: 409,
    }
  }

  const payload = buildAsyncTerminalPayload(env, job, input.resource, wantOutcome)
  const eventType =
    wantOutcome === 'completed' ? 'async_job_completed' : 'async_job_failed'

  const id = await insertCapabilityNotificationDelivery(env.DB, {
    slug: job.slug,
    jobId: job.id,
    eventType,
    channel: prev.channel,
    status: 'pending',
    metadata: { channel: prev.channel, retry_of: prev.id },
  })
  const attemptedAt = nowIso()

  if (prev.channel === 'email') {
    try {
      const retention = String(payload.result_retention ?? '')
      const retrievalHint =
        typeof payload.retrieval_url === 'string' ? payload.retrieval_url : null
      const subject =
        wantOutcome === 'completed'
          ? `402 — Async job completed: ${input.resource.capabilityName ?? job.slug}`
          : `402 — Async job failed: ${input.resource.capabilityName ?? job.slug}`
      const html = `<p><strong>${wantOutcome === 'completed' ? 'Job completed' : 'Job failed'}</strong> (retry)</p>
<p>Capability: ${escapeHtml(input.resource.capabilityName ?? input.resource.label)} (${escapeHtml(job.slug)})</p>
<p>Job ID: <code>${escapeHtml(job.id)}</code></p>
<p>Result state: <code>${escapeHtml(retention)}</code></p>
${retrievalHint ? `<p>Full result: <a href="${escapeHtml(retrievalHint)}">${escapeHtml(retrievalHint)}</a></p>` : ''}
${wantOutcome === 'failed' && job.lastErrorSummary ? `<p>Summary: ${escapeHtml(job.lastErrorSummary)}</p>` : ''}
<p style="color:#666;font-size:12px">402.earth capability notification</p>`
      await sendEmailViaResend(env, { to: email, subject, html })
      await markCapabilityNotificationDeliveryFinished(env.DB, id, {
        status: 'delivered',
        attemptedAt,
        completedAt: nowIso(),
        errorMessage: null,
      })
      return {
        ok: true,
        new_delivery_id: id,
        status: 'delivered',
        error_message: null,
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : 'email failed'
      await markCapabilityNotificationDeliveryFinished(env.DB, id, {
        status: 'failed',
        attemptedAt,
        completedAt: nowIso(),
        errorMessage: err,
      })
      return {
        ok: true,
        new_delivery_id: id,
        status: 'failed',
        error_message: err,
      }
    }
  }

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': '402-earth-capability-webhook/1',
      },
      body: safeJsonStringify(payload),
    })
    if (!res.ok) {
      throw new Error(`Webhook HTTP ${res.status}`)
    }
    await markCapabilityNotificationDeliveryFinished(env.DB, id, {
      status: 'delivered',
      attemptedAt,
      completedAt: nowIso(),
      errorMessage: null,
    })
    return {
      ok: true,
      new_delivery_id: id,
      status: 'delivered',
      error_message: null,
    }
  } catch (e) {
    const err = e instanceof Error ? e.message : 'webhook failed'
    await markCapabilityNotificationDeliveryFinished(env.DB, id, {
      status: 'failed',
      attemptedAt,
      completedAt: nowIso(),
      errorMessage: err,
    })
    return {
      ok: true,
      new_delivery_id: id,
      status: 'failed',
      error_message: err,
    }
  }
}

/**
 * Proactive seller notification when an async job hits a terminal state (Phase 5).
 * Records delivery rows; uses email (Resend) and/or webhook when configured.
 */
export async function dispatchAsyncCapabilityTerminalNotification(
  env: Env,
  input: { jobId: string; outcome: 'completed' | 'failed' },
): Promise<void> {
  const job = await getCapabilityJobById(env.DB, input.jobId)
  if (!job) return
  const resource = await getResourceBySlug(env.DB, job.slug)
  if (!resource || resource.sellType !== 'capability') return
  if (resource.deliveryMode !== 'async') return
  if (!resource.capabilityNotifyEnabled) return
  if (input.outcome === 'completed' && !resource.capabilityNotifyOnComplete) {
    return
  }
  if (input.outcome === 'failed' && !resource.capabilityNotifyOnFail) {
    return
  }

  const email = resource.capabilityNotifyEmail?.trim() ?? ''
  const webhook = resource.capabilityNotifyWebhookUrl?.trim() ?? ''
  const wantEmail =
    resource.capabilityNotifyEmailEnabled && email.length > 0
  const wantWebhook =
    resource.capabilityNotifyWebhookEnabled && webhook.length > 0
  if (!wantEmail && !wantWebhook) {
    const id = await insertCapabilityNotificationDelivery(env.DB, {
      slug: job.slug,
      jobId: job.id,
      eventType:
        input.outcome === 'completed'
          ? 'async_job_completed'
          : 'async_job_failed',
      channel: 'email',
      status: 'pending',
      metadata: { error: 'no_destination_configured' },
    })
    const t = nowIso()
    await markCapabilityNotificationDeliveryFinished(env.DB, id, {
      status: 'failed',
      attemptedAt: t,
      completedAt: t,
      errorMessage:
        'Notifications are enabled but no email or webhook URL is set.',
    })
    return
  }

  const payload = buildAsyncTerminalPayload(
    env,
    job,
    resource as CapabilityResourceRow,
    input.outcome,
  )
  const retention = String(payload.result_retention ?? '')

  if (wantEmail) {
    const id = await insertCapabilityNotificationDelivery(env.DB, {
      slug: job.slug,
      jobId: job.id,
      eventType:
        input.outcome === 'completed'
          ? 'async_job_completed'
          : 'async_job_failed',
      channel: 'email',
      status: 'pending',
      metadata: { channel: 'email' },
    })
    const attemptedAt = nowIso()
    try {
      const retrievalHint =
        typeof payload.retrieval_url === 'string' ? payload.retrieval_url : null
      const subject =
        input.outcome === 'completed'
          ? `402 — Async job completed: ${resource.capabilityName ?? job.slug}`
          : `402 — Async job failed: ${resource.capabilityName ?? job.slug}`
      const html = `<p><strong>${input.outcome === 'completed' ? 'Job completed' : 'Job failed'}</strong></p>
<p>Capability: ${escapeHtml(resource.capabilityName ?? resource.label)} (${escapeHtml(job.slug)})</p>
<p>Job ID: <code>${escapeHtml(job.id)}</code></p>
<p>Result state: <code>${escapeHtml(retention)}</code></p>
${retrievalHint ? `<p>Full result: <a href="${escapeHtml(retrievalHint)}">${escapeHtml(retrievalHint)}</a></p>` : ''}
${input.outcome === 'failed' && job.lastErrorSummary ? `<p>Summary: ${escapeHtml(job.lastErrorSummary)}</p>` : ''}
<p style="color:#666;font-size:12px">402.earth capability notification</p>`
      await sendEmailViaResend(env, { to: email, subject, html })
      await markCapabilityNotificationDeliveryFinished(env.DB, id, {
        status: 'delivered',
        attemptedAt,
        completedAt: nowIso(),
        errorMessage: null,
      })
    } catch (e) {
      await markCapabilityNotificationDeliveryFinished(env.DB, id, {
        status: 'failed',
        attemptedAt,
        completedAt: nowIso(),
        errorMessage: e instanceof Error ? e.message : 'email failed',
      })
    }
  }

  if (wantWebhook) {
    const id = await insertCapabilityNotificationDelivery(env.DB, {
      slug: job.slug,
      jobId: job.id,
      eventType:
        input.outcome === 'completed'
          ? 'async_job_completed'
          : 'async_job_failed',
      channel: 'webhook',
      status: 'pending',
      metadata: { channel: 'webhook' },
    })
    const attemptedAt = nowIso()
    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': '402-earth-capability-webhook/1',
        },
        body: safeJsonStringify(payload),
      })
      if (!res.ok) {
        throw new Error(`Webhook HTTP ${res.status}`)
      }
      await markCapabilityNotificationDeliveryFinished(env.DB, id, {
        status: 'delivered',
        attemptedAt,
        completedAt: nowIso(),
        errorMessage: null,
      })
    } catch (e) {
      await markCapabilityNotificationDeliveryFinished(env.DB, id, {
        status: 'failed',
        attemptedAt,
        completedAt: nowIso(),
        errorMessage: e instanceof Error ? e.message : 'webhook failed',
      })
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
