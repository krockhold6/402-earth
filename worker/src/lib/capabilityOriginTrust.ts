/**
 * Capability endpoint origin trust + SSRF-safe URL validation.
 * Does not leak internal checks in user-facing error messages (use mapTrustToPublicError).
 */

import type { Env } from '../types/env'

export type OriginTrustStatus =
  | 'unverified'
  | 'verified_domain'
  | 'allowlisted'
  | 'blocked'

export type ParseEndpointResult =
  | {
      ok: true
      canonicalUrl: string
      host: string
      hostname: string
    }
  | { ok: false; code: 'CAPABILITY_ENDPOINT_INVALID'; message: string }

export type TrustEvaluation = {
  trust: OriginTrustStatus
  /** When trust is blocked, why (internal logging). */
  internalReason?: string
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '0.0.0.0',
  '::',
  '::1',
])

function isIpv4String(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
}

function parseIpv4(host: string): [number, number, number, number] | null {
  const parts = host.split('.')
  if (parts.length !== 4) return null
  const n = parts.map((p) => parseInt(p, 10))
  if (n.some((x) => !Number.isFinite(x) || x < 0 || x > 255)) return null
  return [n[0]!, n[1]!, n[2]!, n[3]!]
}

function isBlockedIpv4(octets: [number, number, number, number]): boolean {
  const [a, b, c, d] = octets
  if (a === 127) return true
  if (a === 0) return true
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254 && c === 169 && d === 254) return true
  return false
}

function isBlockedIpv6(host: string): boolean {
  const h = host.toLowerCase()
  if (h === '::1') return true
  if (h.startsWith('fc') || h.startsWith('fd')) return true
  if (h.startsWith('fe80:')) return true
  return false
}

/**
 * Parse and normalize https URL; reject non-https and unsafe hosts.
 */
export function parseCapabilityEndpoint(raw: string): ParseEndpointResult {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false, code: 'CAPABILITY_ENDPOINT_INVALID', message: 'endpoint is required' }
  }
  let u: URL
  try {
    u = new URL(trimmed)
  } catch {
    return {
      ok: false,
      code: 'CAPABILITY_ENDPOINT_INVALID',
      message: 'endpoint must be a valid URL',
    }
  }
  if (u.protocol !== 'https:') {
    return {
      ok: false,
      code: 'CAPABILITY_ENDPOINT_INVALID',
      message: 'endpoint must use https',
    }
  }
  const hostname = u.hostname.toLowerCase()
  if (!hostname) {
    return {
      ok: false,
      code: 'CAPABILITY_ENDPOINT_INVALID',
      message: 'endpoint host is missing',
    }
  }
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return {
      ok: false,
      code: 'CAPABILITY_ENDPOINT_INVALID',
      message: 'endpoint host is not allowed',
    }
  }
  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return {
      ok: false,
      code: 'CAPABILITY_ENDPOINT_INVALID',
      message: 'endpoint host is not allowed',
    }
  }
  if (isIpv4String(hostname)) {
    const o = parseIpv4(hostname)
    if (!o || isBlockedIpv4(o)) {
      return {
        ok: false,
        code: 'CAPABILITY_ENDPOINT_INVALID',
        message: 'endpoint host is not allowed',
      }
    }
  } else if (hostname.includes(':')) {
    if (isBlockedIpv6(hostname)) {
      return {
        ok: false,
        code: 'CAPABILITY_ENDPOINT_INVALID',
        message: 'endpoint host is not allowed',
      }
    }
  }

  u.hash = ''
  const canonicalUrl = u.toString()
  const host = hostname.includes(':') && !isIpv4String(hostname) ? `[${u.hostname}]` : hostname
  return { ok: true, canonicalUrl, host, hostname }
}

function readVerifiedHosts(env: Env): Set<string> {
  const raw = env.CAPABILITY_VERIFIED_HOSTS?.trim() ?? ''
  if (!raw) return new Set()
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
}

/**
 * When `CAPABILITY_REQUIRE_TRUST` is true, unverified origins cannot execute.
 * Default (unset) preserves Phase 1 behavior: unverified URLs still run until allowlisted.
 */
function requireTrust(env: Env): boolean {
  const v = env.CAPABILITY_REQUIRE_TRUST?.trim().toLowerCase() ?? ''
  return v === 'true' || v === '1' || v === 'yes'
}

/**
 * Resolve trust for a parsed host (caller already validated URL shape).
 * `allowlisted` requires a row in `capability_origin_allowlist` — caller passes result.
 */
export function evaluateOriginTrust(input: {
  env: Env
  hostname: string
  receiverAddressLower: string
  isOnAllowlist: boolean
}): TrustEvaluation {
  const hostname = input.hostname.toLowerCase()
  const verified = readVerifiedHosts(input.env)
  if (verified.has(hostname)) {
    return { trust: 'verified_domain' }
  }
  if (input.isOnAllowlist) {
    return { trust: 'allowlisted' }
  }
  return {
    trust: 'unverified',
    internalReason: 'not_in_allowlist_or_verified_hosts',
  }
}

/** Whether outbound execution is permitted for this trust level and env. */
export function isExecutionPermittedForTrust(
  env: Env,
  trust: OriginTrustStatus,
): boolean {
  if (trust === 'verified_domain' || trust === 'allowlisted') return true
  if (trust === 'blocked') return false
  if (trust === 'unverified') return !requireTrust(env)
  return false
}

export function mapTrustToPublicExecutionDenial(
  trust: OriginTrustStatus,
): { code: string; httpStatus: number; publicMessage: string } | null {
  if (trust === 'blocked') {
    return {
      code: 'CAPABILITY_ORIGIN_BLOCKED',
      httpStatus: 403,
      publicMessage: 'This capability endpoint is not permitted.',
    }
  }
  if (trust === 'unverified') {
    return {
      code: 'CAPABILITY_ORIGIN_UNVERIFIED',
      httpStatus: 403,
      publicMessage:
        'This capability origin must be verified or allowlisted before execution.',
    }
  }
  return null
}
