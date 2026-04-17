import {
  getResourceBySlug,
  insertResourceDefinition,
} from '../db/resources'
import { parseUsdcMinorUnits, USDC_BASE } from '../lib/facilitator'
import { createResourceSlug } from '../lib/ids'
import { isPaidUnlockType } from '../lib/resourceDelivery'
import { parseReceiverAddressForResource } from '../lib/receiverAddress'
import {
  badRequest,
  conflict,
  json,
  notFound,
} from '../lib/response'
import { nowIso } from '../lib/time'
import type { Env } from '../types/env'
import type { ResourceDefinition } from '../types/resource'

export function publicResourceDefinition(resource: ResourceDefinition) {
  const recv = resource.receiverAddress
  const hasPaidPayload =
    resource.unlockValue != null &&
    String(resource.unlockValue).trim() !== ''
  return {
    slug: resource.slug,
    label: resource.label,
    amount: resource.amount,
    currency: resource.currency,
    network: resource.network,
    active: resource.active,
    unlockType: resource.unlockType,
    /** True when a non-empty `unlock_value` is stored (payload is never exposed here). */
    hasPaidPayload,
    contentType: resource.contentType,
    successRedirectPath: resource.successRedirectPath,
    receiverAddress: recv,
    /** Same as `receiverAddress` — kept for clients that still read this field. */
    paymentReceiverAddress: recv,
    /** USDC contract on Base — EIP-681 token target. */
    usdcContractAddress:
      resource.network.toLowerCase() === 'base' ? USDC_BASE : null,
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

const SLUG_CUSTOM_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

function siteBaseUrl(env: Env): string {
  const s = env.SITE_URL?.trim()
  if (s) return s.replace(/\/$/, '')
  return 'https://402.earth'
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
  const labelRaw = typeof o.label === 'string' ? o.label.trim() : ''
  const amountRaw = typeof o.amount === 'string' ? o.amount.trim() : ''
  const slugOptRaw = typeof o.slug === 'string' ? o.slug.trim() : ''
  const recvParsed = parseReceiverAddressForResource(o.receiverAddress)
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

  const uvRaw = o.unlockValue ?? o.unlock_value
  let unlockValueStr: string
  if (uvRaw === undefined || uvRaw === null) {
    if (unlockType === 'json') {
      unlockValueStr = '{}'
    } else {
      return badRequest(
        'unlockValue is required when unlockType is text or link',
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
    amount: amountRaw,
    currency: 'USDC',
    network: 'base',
    receiverAddress,
    unlockType,
    unlockValue: unlockValueStr,
    contentType: null,
    successRedirectPath,
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

  const paymentUrl = `${siteBaseUrl(env)}/pay/${encodeURIComponent(slug)}`

  return json({
    ok: true,
    resource: publicResourceDefinition(resource),
    paymentUrl,
  })
}
