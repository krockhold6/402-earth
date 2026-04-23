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

/** Stored as `protected_ttl_seconds = 0`; unlock row still needs a finite `expires_at`. */
const PROTECTED_UNLOCK_NO_EXPIRY_TOKEN_SECONDS = Math.floor(
  100 * 365.25 * 24 * 60 * 60,
)

export function effectiveProtectedTtlSeconds(
  resource: ResourceDefinition,
): number {
  const n = resource.protectedTtlSeconds
  if (n === 0) return PROTECTED_UNLOCK_NO_EXPIRY_TOKEN_SECONDS
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
