import { getAttemptById } from '../db/attempts'
import { getResourceBySlug } from '../db/resources'
import { json, notFound } from '../lib/response'
import { paymentRequiredResponse } from '../lib/x402'
import type { Env } from '../types/env'
import type { ResourceDefinition } from '../types/resource'
import { publicResourceDefinition } from './resource'

function requirementsPayload(
  resource: ResourceDefinition,
  attemptId: string | null,
) {
  return {
    scheme: 'x402',
    slug: resource.slug,
    label: resource.label,
    amount: resource.amount,
    currency: resource.currency,
    network: resource.network,
    ...(attemptId ? { attemptId } : {}),
  }
}

export async function handleX402Pay(
  env: Env,
  slug: string,
  url: URL,
): Promise<Response> {
  const resource = await getResourceBySlug(env.DB, slug)
  if (!resource || !resource.active) {
    return notFound('Resource not found')
  }

  const attemptId = url.searchParams.get('attemptId')?.trim() || null

  if (!attemptId) {
    return paymentRequiredResponse({
      body: {
        ok: false,
        resource: publicResourceDefinition(resource),
      },
      requirements: requirementsPayload(resource, null),
    })
  }

  const attempt = await getAttemptById(env.DB, attemptId)
  if (!attempt || attempt.slug !== resource.slug) {
    return notFound('Attempt not found')
  }

  if (attempt.status === 'paid') {
    return json({
      ok: true,
      status: 'paid' as const,
      slug: attempt.slug,
      attemptId: attempt.id,
      resource: { type: 'unlock' as const, value: 'access_granted' as const },
    })
  }

  return paymentRequiredResponse({
    body: {
      ok: false,
      attemptId: attempt.id,
      resource: publicResourceDefinition(resource),
    },
    requirements: requirementsPayload(resource, attempt.id),
  })
}
