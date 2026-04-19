import type { ResourceDefinition } from '../types/resource'

export function normalizeDeliveryMode(raw: string | null | undefined): 'direct' | 'protected' {
  const t = (raw ?? 'direct').trim().toLowerCase()
  if (t === 'protected') return 'protected'
  return 'direct'
}

export function effectiveProtectedTtlSeconds(
  resource: ResourceDefinition,
): number {
  const n = resource.protectedTtlSeconds
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) return Math.floor(n)
  return 900
}

export function protectedUnlockMaxUses(resource: ResourceDefinition): number {
  return resource.oneTimeUnlock ? 1 : 1000
}

export function isProtectedLinkResource(resource: ResourceDefinition): boolean {
  return (
    resource.deliveryMode === 'protected' &&
    resource.unlockType.trim().toLowerCase() === 'link'
  )
}
