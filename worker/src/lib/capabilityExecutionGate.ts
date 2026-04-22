import { isHostAllowlistedForReceiver } from '../db/capabilityAllowlist'
import {
  evaluateOriginTrust,
  isExecutionPermittedForTrust,
  mapTrustToPublicExecutionDenial,
  parseCapabilityEndpoint,
  type OriginTrustStatus,
} from './capabilityOriginTrust'
import type { Env } from '../types/env'
import type { ResourceDefinition } from '../types/resource'

export type ExecutionGateOk = {
  ok: true
  trust: OriginTrustStatus
  hostname: string
  canonicalUrl: string
}

export type ExecutionGateErr = {
  ok: false
  code: string
  httpStatus: number
  publicMessage: string
}

/**
 * Validates endpoint URL + origin trust before any outbound fetch.
 * Direct and protected use the same gate.
 */
export async function gateCapabilityExecution(
  env: Env,
  resource: ResourceDefinition,
): Promise<ExecutionGateOk | ExecutionGateErr> {
  if (resource.sellType === 'capability') {
    const lc = resource.capabilityLifecycle ?? 'active'
    if (lc === 'disabled') {
      return {
        ok: false,
        code: 'CAPABILITY_DISABLED',
        httpStatus: 403,
        publicMessage: 'This capability is disabled and cannot execute.',
      }
    }
    if (lc === 'archived') {
      return {
        ok: false,
        code: 'CAPABILITY_ARCHIVED',
        httpStatus: 403,
        publicMessage: 'This capability is archived and cannot execute.',
      }
    }
  }

  if (resource.sellType !== 'capability' || !resource.endpoint) {
    return {
      ok: false,
      code: 'CAPABILITY_ENDPOINT_INVALID',
      httpStatus: 400,
      publicMessage: 'Capability endpoint is not configured.',
    }
  }

  const parsed = parseCapabilityEndpoint(resource.endpoint)
  if (!parsed.ok) {
    return {
      ok: false,
      code: parsed.code,
      httpStatus: 400,
      publicMessage: 'The capability endpoint URL is not valid.',
    }
  }

  const recv = resource.receiverAddress.toLowerCase()
  const allow = await isHostAllowlistedForReceiver(
    env.DB,
    recv,
    parsed.hostname,
  )
  const ev = evaluateOriginTrust({
    env,
    hostname: parsed.hostname,
    receiverAddressLower: recv,
    isOnAllowlist: allow,
  })
  const trust = ev.trust

  if (!isExecutionPermittedForTrust(env, trust)) {
    const denial = mapTrustToPublicExecutionDenial(trust)
    if (denial) {
      return {
        ok: false,
        code: denial.code,
        httpStatus: denial.httpStatus,
        publicMessage: denial.publicMessage,
      }
    }
  }

  return {
    ok: true,
    trust,
    hostname: parsed.hostname,
    canonicalUrl: parsed.canonicalUrl,
  }
}
