import type { ResourceDefinition } from '../types/resource'

export const PAID_UNLOCK_TYPES = ['json', 'text', 'link'] as const

export type PaidUnlockType = (typeof PAID_UNLOCK_TYPES)[number]

const SUPPORTED = new Set<string>(PAID_UNLOCK_TYPES)

export function isPaidUnlockType(value: string): value is PaidUnlockType {
  return SUPPORTED.has(value)
}

export type PaidDeliveryOk = {
  ok: true
  /** Normalized unlock type for the paid `resource.type` field. */
  resourceType: 'json' | 'text' | 'link'
  /** Parsed or raw value for `resource.value` (object for json, string for text/link). */
  value: unknown
}

export type PaidDeliveryErr = {
  ok: false
  code: string
  message: string
  httpStatus: number
}

export type PaidDeliveryResult = PaidDeliveryOk | PaidDeliveryErr

/**
 * Resolves `resource_definitions.unlock_type` + `unlock_value` into the paid
 * x402 payload. Does not leak secrets to public callers — use only after payment.
 */
export function resolvePaidResourceDelivery(
  resource: ResourceDefinition,
): PaidDeliveryResult {
  const unlockType = resource.unlockType.trim().toLowerCase()

  if (!SUPPORTED.has(unlockType)) {
    return {
      ok: false,
      code: 'UNSUPPORTED_UNLOCK_TYPE',
      message: `unlock_type "${resource.unlockType}" is not supported for paid delivery (expected json, text, or link).`,
      httpStatus: 500,
    }
  }

  const raw = resource.unlockValue
  if (raw == null || String(raw).trim() === '') {
    return {
      ok: false,
      code: 'DELIVERY_NOT_CONFIGURED',
      message:
        'This resource has no unlock_value configured; paid delivery is not available.',
      httpStatus: 503,
    }
  }

  const str = String(raw).trim()

  if (unlockType === 'json') {
    try {
      return {
        ok: true,
        resourceType: 'json',
        value: JSON.parse(str) as unknown,
      }
    } catch {
      return {
        ok: false,
        code: 'MALFORMED_UNLOCK_PAYLOAD',
        message: 'unlock_value is not valid JSON for unlock_type json.',
        httpStatus: 500,
      }
    }
  }

  if (unlockType === 'text') {
    return { ok: true, resourceType: 'text', value: str }
  }

  // link
  try {
    const u = new URL(str)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new Error('unsupported scheme')
    }
    return { ok: true, resourceType: 'link', value: str }
  } catch {
    return {
      ok: false,
      code: 'INVALID_LINK_UNLOCK_VALUE',
      message:
        'unlock_value must be a valid absolute http(s) URL for unlock_type link.',
      httpStatus: 500,
    }
  }
}
