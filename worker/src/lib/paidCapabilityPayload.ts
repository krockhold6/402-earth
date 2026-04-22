import { insertCapabilityAuditEvent } from '../db/capabilityAudit'
import {
  findCapabilityJobByAttemptId,
  insertCapabilityAsyncJob,
} from '../db/capabilityJobs'
import { scheduleCapabilityAsyncJob } from './capabilityAsyncExecutor'
import {
  evaluateCapabilityExecutionPolicy,
  touchCapabilityLastExecution,
} from './capabilityPolicy'
import { gateCapabilityExecution } from './capabilityExecutionGate'
import {
  fetchCapabilityEndpoint,
  RESULT_PREVIEW_MAX,
  truncateResultPreview,
} from './capabilityExecutionFetch'
import {
  asyncPollAndRetrievalUrls,
  buildBuyerOutcomeAsyncQueued,
  buildBuyerOutcomeDirect,
  buildBuyerOutcomeFromAsyncJob,
  buildBuyerOutcomeProtected,
} from './capabilityBuyerOutcome'
import { buildCapabilityReceiptBase } from './capabilityReceipt'
import { createCapabilityJobId } from './ids'
import { apiPublicBaseFromEnv } from './publicUrl'
import { nowIso } from './time'
import type { Env } from '../types/env'
import type { PaymentAttempt } from '../types/payment'
import type { ResourceDefinition } from '../types/resource'

function simpleResultHash(body: string, httpStatus: number): string {
  return `sha256:len:${body.length}:http:${httpStatus}`
}

export async function buildCapabilityPaidSuccessPayload(
  env: Env,
  input: {
    resource: ResourceDefinition
    attempt: PaymentAttempt | null
    attemptIdInQuery: string | null
    executionContext?: ExecutionContext
  },
):
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; body: Record<string, unknown>; status: number } {
  const resource = input.resource
  if (resource.sellType !== 'capability') {
    return {
      ok: false,
      body: { ok: false, error: 'Not a capability', code: 'NOT_CAPABILITY' },
      status: 500,
    }
  }

  const attempt = input.attempt
  const attemptId = attempt?.id ?? input.attemptIdInQuery
  if (!attempt || !attemptId) {
    return {
      ok: false,
      body: {
        ok: false,
        error:
          'Capability fulfillment requires a payment attempt id; retry with attemptId.',
        code: 'ATTEMPT_REQUIRED',
        slug: resource.slug,
      },
      status: 500,
    }
  }

  const paidAt = attempt.paidAt ?? nowIso()
  const ctx = input.executionContext

  if (resource.deliveryMode === 'async') {
    let job = await findCapabilityJobByAttemptId(env.DB, attemptId)
    if (!job) {
      const pol = await evaluateCapabilityExecutionPolicy(env, resource, {
        mode: 'async_new_job',
      })
      if (!pol.ok) {
        return {
          ok: false,
          body: {
            ok: false,
            error: pol.publicMessage,
            code: pol.code,
            slug: resource.slug,
          },
          status: pol.httpStatus,
        }
      }
      const jid = createCapabilityJobId()
      const t = nowIso()
      await insertCapabilityAsyncJob(env.DB, {
        id: jid,
        attemptId,
        slug: resource.slug,
        createdAt: t,
      })
      await touchCapabilityLastExecution(env, resource)
      job = await findCapabilityJobByAttemptId(env.DB, attemptId)
      await insertCapabilityAuditEvent(env.DB, {
        eventType: 'capability_job_created',
        slug: resource.slug,
        jobId: jid,
        actorScope: 'system',
        statusSummary: 'async queued',
        metadata: { attempt_id: attemptId },
      })
    }

    const jobId = job?.id ?? null
    if (jobId && job?.status === 'pending') {
      await scheduleCapabilityAsyncJob(ctx, env, jobId)
    }

    const baseReceipt = buildCapabilityReceiptBase({
      resource,
      attempt,
      executionStatus: 'pending',
      paidAt,
      detailedExtras: {
        async_job_id: jobId,
        result_hash: null,
        provider_metadata: null,
        execution_started_at: null,
        execution_completed_at: null,
        attempt_count: null,
        last_error_summary: null,
      },
    })

    const { poll_url, retrieval_url } = asyncPollAndRetrievalUrls(
      env,
      job,
      jobId,
    )
    const capabilityBuyerOutcome = job
      ? buildBuyerOutcomeFromAsyncJob(job, poll_url, retrieval_url)
      : buildBuyerOutcomeAsyncQueued(jobId, poll_url)

    const asyncValue: Record<string, unknown> = {
      kind: 'capability_async',
      fulfillment: 'async',
      receipt: baseReceipt,
      async_job_id: jobId,
      execution_status: job?.status ?? 'pending',
      poll_hint: poll_url,
    }

    return {
      ok: true,
      body: {
        ok: true,
        status: 'paid' as const,
        slug: resource.slug,
        sellType: 'capability',
        attemptId,
        capabilityReceipt: baseReceipt,
        capability_buyer_outcome: capabilityBuyerOutcome,
        resource: { type: 'json', value: asyncValue },
      },
    }
  }

  if (resource.deliveryMode === 'protected') {
    const proxyUrl = `${apiPublicBaseFromEnv(env)}/api/capability-proxy?slug=${encodeURIComponent(resource.slug)}&attemptId=${encodeURIComponent(attemptId)}`
    const baseReceipt = buildCapabilityReceiptBase({
      resource,
      attempt,
      executionStatus: 'ready_via_proxy',
      paidAt,
      detailedExtras: {
        result_hash: null,
        async_job_id: null,
        provider_metadata: null,
        execution_started_at: null,
        execution_completed_at: null,
        attempt_count: null,
        last_error_summary: null,
      },
    })

    const protectedValue: Record<string, unknown> = {
      kind: 'capability_protected',
      fulfillment: 'protected',
      receipt: baseReceipt,
      proxy_url: proxyUrl,
      origin_trust_status: resource.capabilityOriginTrust,
      note:
        '402 proxies execution server-side; the seller origin is not returned to the client. Execution is validated when you open the proxy URL.',
    }

    const capabilityBuyerOutcome = buildBuyerOutcomeProtected(proxyUrl)

    return {
      ok: true,
      body: {
        ok: true,
        status: 'paid' as const,
        slug: resource.slug,
        sellType: 'capability',
        attemptId,
        capabilityReceipt: baseReceipt,
        capability_buyer_outcome: capabilityBuyerOutcome,
        resource: { type: 'json', value: protectedValue },
      },
    }
  }

  await insertCapabilityAuditEvent(env.DB, {
    eventType: 'capability_execution_requested',
    slug: resource.slug,
    actorScope: 'system',
    statusSummary: 'direct',
    metadata: { attempt_id: attemptId },
  })

  const gate = await gateCapabilityExecution(env, resource)
  if (!gate.ok) {
    await insertCapabilityAuditEvent(env.DB, {
      eventType: 'capability_execution_blocked',
      slug: resource.slug,
      actorScope: 'system',
      statusSummary: gate.publicMessage,
      metadata: { code: gate.code, mode: 'direct' },
    })
    return {
      ok: false,
      body: {
        ok: false,
        error: gate.publicMessage,
        code: gate.code,
        slug: resource.slug,
      },
      status: gate.httpStatus,
    }
  }

  await insertCapabilityAuditEvent(env.DB, {
    eventType: 'capability_execution_gated',
    slug: resource.slug,
    actorScope: 'system',
    statusSummary: 'allowed',
    metadata: { trust: gate.trust, mode: 'direct' },
  })

  const pol = await evaluateCapabilityExecutionPolicy(env, resource, {
    mode: 'sync_execution',
  })
  if (!pol.ok) {
    return {
      ok: false,
      body: {
        ok: false,
        error: pol.publicMessage,
        code: pol.code,
        slug: resource.slug,
      },
      status: pol.httpStatus,
    }
  }
  await touchCapabilityLastExecution(env, resource)
  await insertCapabilityAuditEvent(env.DB, {
    eventType: 'capability_sync_execution_started',
    slug: resource.slug,
    actorScope: 'system',
    statusSummary: 'direct',
    metadata: { attempt_id: attemptId },
  })

  const exec = await fetchCapabilityEndpoint(resource)
  const execStatus = exec.error
    ? 'failed'
    : exec.ok
      ? 'succeeded'
      : 'completed_with_error'

  const resultHash = exec.bodyText.length > 0 ? simpleResultHash(exec.bodyText, exec.httpStatus) : null
  const completedAt = nowIso()
  const baseReceipt = buildCapabilityReceiptBase({
    resource,
    attempt,
    executionStatus: execStatus,
    paidAt,
    originTrust: gate.trust,
    originHost: gate.hostname,
    detailedExtras: {
      result_hash: resultHash,
      async_job_id: null,
      provider_metadata: {
        http_status: exec.httpStatus,
        response_length: exec.bodyText.length,
      },
      execution_started_at: null,
      execution_completed_at: completedAt,
      attempt_count: 1,
      last_error_summary: exec.error ?? null,
    },
  })

  const execution: Record<string, unknown> = {
    http_status: exec.httpStatus,
    fetch_error: exec.error ?? null,
  }
  let hasFullBody = false
  let hasPreviewOnly = false
  if (exec.bodyText.length <= RESULT_PREVIEW_MAX) {
    execution.body = exec.bodyText
    hasFullBody = exec.bodyText.length > 0
  } else {
    execution.body_preview = truncateResultPreview(exec.bodyText)
    execution.body_truncated = true
    hasPreviewOnly = true
  }

  const capabilityBuyerOutcome = buildBuyerOutcomeDirect({
    executionStatus: execStatus,
    hasFullBody,
    hasPreviewOnly,
  })

  const directValue: Record<string, unknown> = {
    kind: 'capability_direct',
    fulfillment: 'direct',
    receipt: baseReceipt,
    origin_trust_status: gate.trust,
    execution,
  }

  return {
    ok: true,
    body: {
      ok: true,
      status: 'paid' as const,
      slug: resource.slug,
      sellType: 'capability',
      attemptId,
      capabilityReceipt: baseReceipt,
      capability_buyer_outcome: capabilityBuyerOutcome,
      resource: { type: 'json', value: directValue },
    },
  }
}
