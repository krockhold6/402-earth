import type {
  CapabilityDeliveryMode,
  ResourceDefinition,
  ResourceDeliveryMode,
  SellType,
  StoredDeliveryMode,
} from '../types/resource'

export function normalizeResourceDeliveryMode(
  raw: string | null | undefined,
): ResourceDeliveryMode {
  const t = (raw ?? 'direct').trim().toLowerCase()
  if (t === 'protected') return 'protected'
  return 'direct'
}

export function normalizeCapabilityDeliveryMode(
  raw: string | null | undefined,
): CapabilityDeliveryMode {
  const t = (raw ?? 'direct').trim().toLowerCase()
  if (t === 'async') return 'async'
  if (t === 'protected') return 'protected'
  return 'direct'
}

export function rowDeliveryMode(
  sellType: SellType,
  raw: string | null | undefined,
): StoredDeliveryMode {
  if (sellType === 'capability') {
    return normalizeCapabilityDeliveryMode(raw)
  }
  return normalizeResourceDeliveryMode(raw)
}

/** @deprecated Use normalizeResourceDeliveryMode or rowDeliveryMode */
export function normalizeDeliveryMode(
  raw: string | null | undefined,
): ResourceDeliveryMode {
  return normalizeResourceDeliveryMode(raw)
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
    resource.sellType === 'resource' &&
    resource.deliveryMode === 'protected' &&
    resource.unlockType.trim().toLowerCase() === 'link'
  )
}
