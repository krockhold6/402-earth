import {
  findActiveUnlockTokenForAttempt,
  insertUnlockToken,
} from '../db/unlockTokens'
import { createUnlockTokenValue } from './ids'
import { apiPublicBaseFromEnv } from './publicUrl'
import { resolvePaidResourceDelivery } from './resourceDelivery'
import {
  effectiveProtectedTtlSeconds,
  isProtectedLinkResource,
  protectedUnlockMaxUses,
} from './deliveryMode'
import { buildCapabilityPaidSuccessPayload } from './paidCapabilityPayload'
import { addSecondsIso, nowIso } from './time'
import type { Env } from '../types/env'
import type { PaymentAttempt } from '../types/payment'
import type { ResourceDefinition } from '../types/resource'

export async function buildPaidSuccessPayload(
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
  if (input.resource.sellType === 'capability') {
    return buildCapabilityPaidSuccessPayload(env, input)
  }

  const delivery = resolvePaidResourceDelivery(input.resource)
  if (!delivery.ok) {
    const errBody: Record<string, unknown> = {
      ok: false,
      error: delivery.message,
      code: delivery.code,
      slug: input.resource.slug,
    }
    if (input.attempt) {
      errBody.attemptId = input.attempt.id
    } else if (input.attemptIdInQuery) {
      errBody.attemptId = input.attemptIdInQuery
    }
    return { ok: false, body: errBody, status: delivery.httpStatus }
  }

  if (
    input.resource.deliveryMode === 'protected' &&
    delivery.resourceType !== 'link'
  ) {
    const errBody: Record<string, unknown> = {
      ok: false,
      error:
        'This resource is set to protected delivery, but its unlock payload is not a link. Update the resource to unlockType link or switch delivery to direct.',
      code: 'PROTECTED_DELIVERY_MISCONFIGURED',
      slug: input.resource.slug,
    }
    if (input.attempt) {
      errBody.attemptId = input.attempt.id
    } else if (input.attemptIdInQuery) {
      errBody.attemptId = input.attemptIdInQuery
    }
    return { ok: false, body: errBody, status: 500 }
  }

  const attemptId = input.attempt?.id ?? input.attemptIdInQuery

  let resourcePayload: { type: string; value: unknown }
  if (isProtectedLinkResource(input.resource)) {
    if (!attemptId) {
      return {
        ok: false,
        body: {
          ok: false,
          error:
            'Protected delivery requires a payment attempt id; retry with attemptId.',
          code: 'ATTEMPT_REQUIRED_FOR_PROTECTED',
          slug: input.resource.slug,
        },
        status: 500,
      }
    }
    const finalUrl = delivery.value as string
    const t = nowIso()
    const existing = await findActiveUnlockTokenForAttempt(env.DB, attemptId, t)
    let bearer: string
    if (existing) {
      bearer = existing.token
    } else {
      bearer = createUnlockTokenValue()
      const ttl = effectiveProtectedTtlSeconds(input.resource)
      const expiresAt = addSecondsIso(t, ttl)
      await insertUnlockToken(env.DB, {
        id: bearer,
        token: bearer,
        attemptId,
        slug: input.resource.slug,
        resourceType: 'link',
        resourceValue: finalUrl,
        createdAt: t,
        expiresAt,
        maxUses: protectedUnlockMaxUses(input.resource),
      })
    }
    const unlockUrl = `${apiPublicBaseFromEnv(env)}/unlock/${encodeURIComponent(bearer)}`
    resourcePayload = { type: 'link', value: unlockUrl }
  } else {
    resourcePayload = {
      type: delivery.resourceType,
      value: delivery.value,
    }
  }

  const body: Record<string, unknown> = {
    ok: true,
    status: 'paid' as const,
    slug: input.resource.slug,
    resource: resourcePayload,
  }
  if (input.attempt) {
    body.attemptId = input.attempt.id
  } else if (input.attemptIdInQuery) {
    body.attemptId = input.attemptIdInQuery
  }
  return { ok: true, body }
}
