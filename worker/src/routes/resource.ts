import { getResourceBySlug } from '../db/resources'
import { json, notFound } from '../lib/response'
import type { Env } from '../types/env'
import type { ResourceDefinition } from '../types/resource'

export function publicResourceDefinition(resource: ResourceDefinition) {
  return {
    slug: resource.slug,
    label: resource.label,
    amount: resource.amount,
    currency: resource.currency,
    network: resource.network,
    active: resource.active,
    unlockType: resource.unlockType,
    contentType: resource.contentType,
    successRedirectPath: resource.successRedirectPath,
  }
}

export async function handleGetResource(
  env: Env,
  slug: string,
): Promise<Response> {
  const resource = await getResourceBySlug(env.DB, slug)
  if (!resource || !resource.active) {
    return notFound('Resource not found')
  }
  return json({
    ok: true,
    resource: publicResourceDefinition(resource),
  })
}
