import { insertCapabilityAuditEvent } from '../db/capabilityAudit'
import { getAttemptById } from '../db/attempts'
import { getResourceBySlug } from '../db/resources'
import { gateCapabilityExecution } from '../lib/capabilityExecutionGate'
import {
  evaluateCapabilityExecutionPolicy,
  touchCapabilityLastExecution,
} from '../lib/capabilityPolicy'
import { fetchCapabilityEndpoint } from '../lib/capabilityExecutionFetch'
import { json, notFound } from '../lib/response'
import type { Env } from '../types/env'

/**
 * GET — server-side proxy for paid capabilities (protected delivery).
 * Does not echo the upstream URL to the client. Origin trust is enforced here.
 */
export async function handleGetCapabilityProxy(
  env: Env,
  url: URL,
): Promise<Response> {
  const slug = url.searchParams.get('slug')?.trim()
  const attemptId = url.searchParams.get('attemptId')?.trim()
  if (!slug || !attemptId) {
    return json(
      { ok: false, error: 'slug and attemptId are required', code: 'BAD_REQUEST' },
      { status: 400 },
    )
  }

  const resource = await getResourceBySlug(env.DB, slug)
  if (!resource || !resource.active || resource.sellType !== 'capability') {
    return notFound('Capability not found')
  }
  if (resource.deliveryMode !== 'protected') {
    return json(
      {
        ok: false,
        error: 'This capability is not configured for protected execution.',
        code: 'NOT_PROTECTED_CAPABILITY',
      },
      { status: 400 },
    )
  }

  const attempt = await getAttemptById(env.DB, attemptId)
  if (!attempt || attempt.slug !== slug) {
    return json(
      { ok: false, error: 'Attempt not found', code: 'ATTEMPT_NOT_FOUND' },
      { status: 404 },
    )
  }
  if (attempt.status !== 'paid') {
    return json(
      {
        ok: false,
        error: 'Payment required before proxy execution.',
        code: 'NOT_PAID',
      },
      { status: 402 },
    )
  }

  await insertCapabilityAuditEvent(env.DB, {
    eventType: 'capability_execution_requested',
    slug: resource.slug,
    actorScope: 'system',
    statusSummary: 'protected proxy',
    metadata: { attempt_id: attemptId },
  })

  const gate = await gateCapabilityExecution(env, resource)
  if (!gate.ok) {
    await insertCapabilityAuditEvent(env.DB, {
      eventType: 'capability_execution_blocked',
      slug: resource.slug,
      actorScope: 'system',
      statusSummary: gate.publicMessage,
      metadata: { code: gate.code, mode: 'protected' },
    })
    return json(
      {
        ok: false,
        error: gate.publicMessage,
        code: gate.code,
      },
      { status: gate.httpStatus },
    )
  }

  await insertCapabilityAuditEvent(env.DB, {
    eventType: 'capability_execution_gated',
    slug: resource.slug,
    actorScope: 'system',
    statusSummary: 'allowed',
    metadata: { trust: gate.trust, mode: 'protected' },
  })

  const pol = await evaluateCapabilityExecutionPolicy(env, resource, {
    mode: 'sync_execution',
  })
  if (!pol.ok) {
    return json(
      {
        ok: false,
        error: pol.publicMessage,
        code: pol.code,
      },
      { status: pol.httpStatus },
    )
  }
  await touchCapabilityLastExecution(env, resource)
  await insertCapabilityAuditEvent(env.DB, {
    eventType: 'capability_sync_execution_started',
    slug: resource.slug,
    actorScope: 'system',
    statusSummary: 'protected',
    metadata: { attempt_id: attemptId },
  })

  const exec = await fetchCapabilityEndpoint(resource)
  if (exec.error) {
    return json(
      {
        ok: false,
        proxied: true,
        sell_type: 'capability',
        code: 'CAPABILITY_EXECUTION_FAILED',
        error: 'The capability endpoint could not be reached.',
      },
      { status: 502 },
    )
  }

  return json({
    ok: true,
    proxied: true,
    sell_type: 'capability',
    origin_trust_status: gate.trust,
    http_status: exec.httpStatus,
    body: exec.bodyText,
    fetch_error: null,
  })
}
