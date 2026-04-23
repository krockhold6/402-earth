import { insertCapabilityAuditEvent } from '../db/capabilityAudit'
import {
  getResourceBySlug,
  insertResourceDefinition,
} from '../db/resources'
import {
  normalizeCapabilityDeliveryMode,
  normalizeResourceDeliveryMode,
} from '../lib/deliveryMode'
import { parseUsdcMinorUnits, USDC_BASE } from '../lib/facilitator'
import { createResourceSlug } from '../lib/ids'
import { isPaidUnlockType } from '../lib/resourceDelivery'
import { parseReceiverAddressForResource } from '../lib/receiverAddress'
import { isHostAllowlistedForReceiver } from '../db/capabilityAllowlist'
import {
  evaluateOriginTrust,
  parseCapabilityEndpoint,
} from '../lib/capabilityOriginTrust'
import {
  parseCapabilityExposure,
  parseCapabilityMcpType,
  isValidHttpMethod,
  parseNonEmptyString,
  parseReceiptMode,
  parseSellType,
} from '../lib/sellValidation'
import { buyerUnlockPageUrl } from '../lib/siteUrl'
import {
  badRequest,
  conflict,
  json,
  notFound,
} from '../lib/response'
import { isExecutionPermittedForTrust } from '../lib/capabilityOriginTrust'
import { evaluateCapabilityPolicyForBuyerPeek } from '../lib/capabilityPolicy'
import { nowIso } from '../lib/time'
import type { Env } from '../types/env'
import type { ResourceDefinition } from '../types/resource'

export function publicResourceDefinition(
  resource: ResourceDefinition,
  env?: Env,
) {
  const recv = resource.receiverAddress
  const hasPaidPayload =
    resource.unlockValue != null &&
    String(resource.unlockValue).trim() !== ''
  const base: Record<string, unknown> = {
    slug: resource.slug,
    label: resource.label,
    sellType: resource.sellType,
    amount: resource.amount,
    price_usdc: resource.amount,
    currency: resource.currency,
    network: resource.network,
    active: resource.active,
    unlockType: resource.unlockType,
    deliveryMode: resource.deliveryMode,
    protectedTtlSeconds: resource.protectedTtlSeconds,
    oneTimeUnlock: resource.oneTimeUnlock,
    hasPaidPayload,
    contentType: resource.contentType,
    successRedirectPath: resource.successRedirectPath,
    receiverAddress: recv,
    paymentReceiverAddress: recv,
    usdcContractAddress:
      resource.network.toLowerCase() === 'base' ? USDC_BASE : null,
  }
  if (resource.sellType === 'capability') {
    const lc = resource.capabilityLifecycle ?? 'active'
    base.capabilityName = resource.capabilityName
    base.endpoint = resource.endpoint
    base.httpMethod = resource.httpMethod
    base.inputFormat = resource.inputFormat
    base.resultFormat = resource.resultFormat
    base.receiptMode = resource.receiptMode
    base.capabilityEndpointCanonical = resource.capabilityEndpointCanonical
    base.capabilityOriginHost = resource.capabilityOriginHost
    base.capabilityOriginTrust = resource.capabilityOriginTrust
    base.capabilityLifecycle = lc
    base.capabilityExposure = resource.capabilityExposure ?? 'api'
    base.mcpName = resource.mcpName ?? null
    base.mcpDescription = resource.mcpDescription ?? null
    base.mcpType = resource.mcpType ?? null
    base.mcpRequiresPayment =
      resource.mcpRequiresPayment == null ? true : resource.mcpRequiresPayment === true
    const trust = resource.capabilityOriginTrust
    if (lc === 'active' && trust != null && env) {
      base.executionAllowed = isExecutionPermittedForTrust(env, trust)
    } else if (lc === 'active' && trust != null) {
      base.executionAllowed = trust !== 'blocked'
    } else {
      base.executionAllowed = false
    }
  }
  return base
}

export async function handleGetResource(
  env: Env,
  slug: string,
): Promise<Response> {
  const resource = await getResourceBySlug(env.DB, slug)
  if (!resource || !resource.active) {
    return notFound('Resource not found')
  }
  const base = publicResourceDefinition(resource, env) as Record<string, unknown>
  if (resource.sellType === 'capability') {
    const peek = await evaluateCapabilityPolicyForBuyerPeek(env, resource)
    base.capability_buyer_execution = peek.ok
      ? { allowed: true }
      : {
          allowed: false,
          code: peek.code,
          summary: peek.publicMessage,
        }
  }
  return json({
    ok: true,
    resource: base,
  })
}

const SLUG_CUSTOM_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

function parseOptionalBool(raw: unknown): boolean | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw !== 0
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase()
    if (s === '') return undefined
    if (s === '1' || s === 'true' || s === 'yes') return true
    if (s === '0' || s === 'false' || s === 'no') return false
  }
  return undefined
}

function readAmount(o: Record<string, unknown>): string {
  const price =
    typeof o.price_usdc === 'string'
      ? o.price_usdc.trim()
      : typeof o.priceUsdc === 'string'
        ? o.priceUsdc.trim()
        : ''
  if (price !== '') return price
  return typeof o.amount === 'string' ? o.amount.trim() : ''
}

export async function handlePostResource(
  env: Env,
  req: Request,
): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('Invalid JSON body')
  }

  const o = body as Record<string, unknown>
  const sellParsed = parseSellType(o.sell_type ?? o.sellType)
  if (sellParsed === null) {
    return badRequest('sell_type must be resource or capability')
  }

  if (sellParsed === 'capability') {
    return handlePostCapability(env, o)
  }

  return handlePostResourceOnly(env, o)
}

async function handlePostCapability(
  env: Env,
  o: Record<string, unknown>,
): Promise<Response> {
  const capabilityName = parseNonEmptyString(
    o.capability_name ?? o.capabilityName,
    'capability_name',
  )
  if (!capabilityName.ok) return badRequest(capabilityName.message)

  const methodRaw = parseNonEmptyString(o.http_method ?? o.httpMethod, 'http_method')
  if (!methodRaw.ok) return badRequest(methodRaw.message)
  const httpMethod = methodRaw.value.toUpperCase()
  if (!isValidHttpMethod(httpMethod)) {
    return badRequest('http_method must be GET, POST, PUT, PATCH, or DELETE')
  }

  const inputFormat = parseNonEmptyString(o.input_format ?? o.inputFormat, 'input_format')
  if (!inputFormat.ok) return badRequest(inputFormat.message)

  const resultFormat = parseNonEmptyString(
    o.result_format ?? o.resultFormat,
    'result_format',
  )
  if (!resultFormat.ok) return badRequest(resultFormat.message)

  const recvParsed = parseReceiverAddressForResource(
    o.payout_wallet ?? o.payoutWallet ?? o.receiverAddress,
  )
  if (!recvParsed.ok) {
    return badRequest(recvParsed.message)
  }
  const receiverAddress = recvParsed.value

  const endpointParsed = parseCapabilityEndpoint(
    typeof o.endpoint === 'string' ? o.endpoint : '',
  )
  if (!endpointParsed.ok) {
    return json(
      {
        ok: false,
        error: endpointParsed.message,
        code: endpointParsed.code,
      },
      { status: 400 },
    )
  }

  const allow = await isHostAllowlistedForReceiver(
    env.DB,
    receiverAddress,
    endpointParsed.hostname,
  )
  const trustEv = evaluateOriginTrust({
    env,
    hostname: endpointParsed.hostname,
    receiverAddressLower: receiverAddress,
    isOnAllowlist: allow,
  })
  const trustStr = trustEv.trust

  const amountRaw = readAmount(o)
  if (!amountRaw) {
    return badRequest('amount or price_usdc is required')
  }
  if (parseUsdcMinorUnits(amountRaw) === null) {
    return badRequest(
      'Invalid amount (expected USDC-style decimal, up to 6 fractional digits)',
    )
  }

  const deliveryRaw =
    typeof o.delivery_mode === 'string'
      ? o.delivery_mode.trim().toLowerCase()
      : typeof o.deliveryMode === 'string'
        ? o.deliveryMode.trim().toLowerCase()
        : ''
  const deliveryMode = normalizeCapabilityDeliveryMode(deliveryRaw || 'direct')

  const receiptParsed = parseReceiptMode(o.receipt_mode ?? o.receiptMode)
  if (!receiptParsed.ok) return badRequest(receiptParsed.message)

  const exposureParsed = parseCapabilityExposure(
    o.capability_exposure ?? o.capabilityExposure ?? 'api',
  )
  if (!exposureParsed.ok) return badRequest(exposureParsed.message)
  const capabilityExposure = exposureParsed.value
  const mcpTypeParsed = parseCapabilityMcpType(
    o.mcp_type ?? o.mcpType ?? (capabilityExposure === 'api' ? null : 'tool'),
  )
  if (!mcpTypeParsed.ok) return badRequest(mcpTypeParsed.message)
  const mcpType = mcpTypeParsed.value
  const mcpNameRaw =
    typeof o.mcp_name === 'string'
      ? o.mcp_name.trim()
      : typeof o.mcpName === 'string'
        ? o.mcpName.trim()
        : ''
  const mcpDescriptionRaw =
    typeof o.mcp_description === 'string'
      ? o.mcp_description.trim()
      : typeof o.mcpDescription === 'string'
        ? o.mcpDescription.trim()
        : ''
  const mcpName = mcpNameRaw === '' ? capabilityName.value : mcpNameRaw
  const mcpDescription = mcpDescriptionRaw === '' ? null : mcpDescriptionRaw
  const mcpRequiresPaymentRaw =
    o.mcp_requires_payment ?? o.mcpRequiresPayment ?? true
  const mcpRequiresPayment =
    typeof mcpRequiresPaymentRaw === 'boolean' ? mcpRequiresPaymentRaw : true

  const slugOptRaw = typeof o.slug === 'string' ? o.slug.trim() : ''
  let slug: string
  if (slugOptRaw !== '') {
    const s = slugOptRaw.toLowerCase()
    if (s.length > 64 || !SLUG_CUSTOM_RE.test(s)) {
      return badRequest(
        'Invalid slug (lowercase letters, digits, interior hyphens; max 64 chars)',
      )
    }
    slug = s
    const taken = await getResourceBySlug(env.DB, slug)
    if (taken) {
      return conflict('A resource with this slug already exists')
    }
  } else {
    let attempts = 0
    do {
      slug = createResourceSlug()
      attempts++
      if (attempts > 12) {
        return json(
          { ok: false, error: 'Could not allocate a unique slug' },
          { status: 503 },
        )
      }
    } while (await getResourceBySlug(env.DB, slug))
  }

  const t = nowIso()
  const successRedirectPath = `/success/${encodeURIComponent(slug)}`

  await insertResourceDefinition(env.DB, {
    slug,
    label: capabilityName.value,
    sellType: 'capability',
    amount: amountRaw,
    currency: 'USDC',
    network: 'base',
    receiverAddress,
    unlockType: 'json',
    unlockValue: '{}',
    deliveryMode,
    protectedTtlSeconds: null,
    oneTimeUnlock: false,
    contentType: null,
    successRedirectPath,
    capabilityName: capabilityName.value,
    endpoint: endpointParsed.canonicalUrl,
    httpMethod,
    inputFormat: inputFormat.value,
    resultFormat: resultFormat.value,
    receiptMode: receiptParsed.value,
    capabilityEndpointCanonical: endpointParsed.canonicalUrl,
    capabilityOriginHost: endpointParsed.hostname,
    capabilityOriginTrust: trustStr,
    capabilityLifecycle: 'active',
    capabilityExposure,
    mcpName: capabilityExposure === 'api' ? null : mcpName,
    mcpDescription: capabilityExposure === 'api' ? null : mcpDescription,
    mcpType: capabilityExposure === 'api' ? null : mcpType,
    mcpRequiresPayment: capabilityExposure === 'api' ? null : mcpRequiresPayment,
    createdAt: t,
    updatedAt: t,
  })

  await insertCapabilityAuditEvent(env.DB, {
    eventType: 'capability_created',
    slug,
    actorScope: 'system',
    statusSummary: 'created',
    metadata: { receiver: receiverAddress },
  })

  const resource = await getResourceBySlug(env.DB, slug)
  if (!resource) {
    return json(
      { ok: false, error: 'Failed to load created capability' },
      { status: 500 },
    )
  }

  const paymentUrl = buyerUnlockPageUrl(env, slug)

  return json({
    ok: true,
    sell_type: 'capability',
    resource: publicResourceDefinition(resource, env),
    paymentUrl,
    qrUrl: paymentUrl,
  })
}

async function handlePostResourceOnly(
  env: Env,
  o: Record<string, unknown>,
): Promise<Response> {
  const labelRaw = typeof o.label === 'string' ? o.label.trim() : ''
  const amountRaw = readAmount(o)
  const slugOptRaw = typeof o.slug === 'string' ? o.slug.trim() : ''
  const recvParsed = parseReceiverAddressForResource(
    o.receiverAddress ?? o.payout_wallet ?? o.payoutWallet,
  )
  if (!recvParsed.ok) {
    return badRequest(recvParsed.message)
  }
  const receiverAddress = recvParsed.value

  const unlockTypeRaw =
    typeof o.unlockType === 'string'
      ? o.unlockType.trim().toLowerCase()
      : typeof o.unlock_type === 'string'
        ? o.unlock_type.trim().toLowerCase()
        : ''
  const unlockType = unlockTypeRaw || 'json'
  if (!isPaidUnlockType(unlockType)) {
    return badRequest('unlockType must be one of: json, text, link')
  }

  const uvRaw =
    o.unlockValue ??
    o.unlock_value ??
    o.destination_url ??
    o.destinationUrl
  let unlockValueStr: string
  if (uvRaw === undefined || uvRaw === null) {
    if (unlockType === 'json') {
      unlockValueStr = '{}'
    } else {
      return badRequest(
        'unlockValue is required when unlockType is text or link (or use destination_url for link)',
      )
    }
  } else if (typeof uvRaw === 'string') {
    unlockValueStr = uvRaw
  } else if (typeof uvRaw === 'object' && !Array.isArray(uvRaw)) {
    if (unlockType !== 'json') {
      return badRequest(
        'unlockValue object form is only allowed when unlockType is json',
      )
    }
    unlockValueStr = JSON.stringify(uvRaw)
  } else {
    return badRequest(
      'unlockValue must be a string, or a JSON object when unlockType is json',
    )
  }

  if (unlockType === 'json') {
    try {
      JSON.parse(unlockValueStr)
    } catch {
      return badRequest('unlockValue is not valid JSON for unlockType json')
    }
  } else if (unlockType === 'link') {
    try {
      const u = new URL(unlockValueStr.trim())
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new Error('bad scheme')
      }
      unlockValueStr = u.toString()
    } catch {
      return badRequest(
        'unlockValue must be a valid absolute http(s) URL for unlockType link',
      )
    }
  } else if (unlockType === 'text' && unlockValueStr.trim() === '') {
    return badRequest('unlockValue must be non-empty for unlockType text')
  }

  const deliveryModeRaw =
    typeof o.deliveryMode === 'string'
      ? o.deliveryMode.trim().toLowerCase()
      : typeof o.delivery_mode === 'string'
        ? o.delivery_mode.trim().toLowerCase()
        : ''
  if (deliveryModeRaw === 'async') {
    return badRequest('delivery_mode async is only valid when sell_type is capability')
  }
  const deliveryMode = normalizeResourceDeliveryMode(deliveryModeRaw || 'direct')

  if (deliveryMode === 'protected' && unlockType !== 'link') {
    return json(
      {
        ok: false,
        error: 'Protected delivery is only available when unlockType is link.',
        code: 'PROTECTED_REQUIRES_LINK',
        fields: {
          deliveryMode: [
            'Use unlockType "link" with unlockValue set to the final destination URL.',
          ],
        },
      },
      { status: 400 },
    )
  }

  let protectedTtlSeconds: number | null = null
  const ttlRaw = o.protectedTtlSeconds ?? o.protected_ttl_seconds
  if (ttlRaw !== undefined && ttlRaw !== null && ttlRaw !== '') {
    const n =
      typeof ttlRaw === 'number' ? ttlRaw : parseInt(String(ttlRaw).trim(), 10)
    if (n === 0) {
      protectedTtlSeconds = 0
    } else if (!Number.isFinite(n) || n < 60 || n > 604800) {
      return badRequest(
        'protectedTtlSeconds must be 0 (no expiry), or an integer from 60 to 604800 (1 minute to 7 days)',
      )
    } else {
      protectedTtlSeconds = Math.floor(n)
    }
  }

  const oneTimeUnlockRaw = parseOptionalBool(
    o.oneTimeUnlock ?? o.one_time_unlock,
  )
  const oneTimeUnlock =
    deliveryMode === 'protected' ? Boolean(oneTimeUnlockRaw) : false
  const protectedTtlStored =
    deliveryMode === 'protected' ? protectedTtlSeconds : null

  if (!labelRaw) {
    return badRequest('label is required')
  }
  if (labelRaw.length > 200) {
    return badRequest('label is too long')
  }
  if (!amountRaw) {
    return badRequest('amount is required')
  }
  if (parseUsdcMinorUnits(amountRaw) === null) {
    return badRequest(
      'Invalid amount (expected USDC-style decimal, up to 6 fractional digits)',
    )
  }

  let slug: string
  if (slugOptRaw !== '') {
    const s = slugOptRaw.toLowerCase()
    if (s.length > 64 || !SLUG_CUSTOM_RE.test(s)) {
      return badRequest(
        'Invalid slug (lowercase letters, digits, interior hyphens; max 64 chars)',
      )
    }
    slug = s
    const taken = await getResourceBySlug(env.DB, slug)
    if (taken) {
      return conflict('A resource with this slug already exists')
    }
  } else {
    let attempts = 0
    do {
      slug = createResourceSlug()
      attempts++
      if (attempts > 12) {
        return json(
          { ok: false, error: 'Could not allocate a unique slug' },
          { status: 503 },
        )
      }
    } while (await getResourceBySlug(env.DB, slug))
  }

  const t = nowIso()
  const successRedirectPath = `/success/${encodeURIComponent(slug)}`

  await insertResourceDefinition(env.DB, {
    slug,
    label: labelRaw,
    sellType: 'resource',
    amount: amountRaw,
    currency: 'USDC',
    network: 'base',
    receiverAddress,
    unlockType,
    unlockValue: unlockValueStr,
    deliveryMode,
    protectedTtlSeconds: protectedTtlStored,
    oneTimeUnlock,
    contentType: null,
    successRedirectPath,
    capabilityName: null,
    endpoint: null,
    httpMethod: null,
    inputFormat: null,
    resultFormat: null,
    receiptMode: null,
    capabilityEndpointCanonical: null,
    capabilityOriginHost: null,
    capabilityOriginTrust: null,
    capabilityLifecycle: null,
    capabilityExposure: null,
    mcpName: null,
    mcpDescription: null,
    mcpType: null,
    mcpRequiresPayment: null,
    createdAt: t,
    updatedAt: t,
  })

  const resource = await getResourceBySlug(env.DB, slug)
  if (!resource) {
    return json(
      { ok: false, error: 'Failed to load created resource' },
      { status: 500 },
    )
  }

  const paymentUrl = buyerUnlockPageUrl(env, slug)

  return json({
    ok: true,
    sell_type: 'resource',
    resource: publicResourceDefinition(resource, env),
    paymentUrl,
    qrUrl: paymentUrl,
  })
}
