import {
  countCapabilityPolicyDeniedForSlugWindow,
  insertCapabilityAuditEvent,
  listCapabilityAuditEventsForSlug,
} from '../db/capabilityAudit'
import {
  deleteAllowlistEntry,
  insertAllowlistEntry,
  isHostAllowlistedForReceiver,
  listAllowlistForReceiver,
  normalizeAllowlistHost,
} from '../db/capabilityAllowlist'
import {
  analyticsResultAvailabilityRate,
  analyticsSuccessRate,
  getCapabilityAnalyticsForSlug,
  getCapabilityAnalyticsForSlugs,
  getCapabilityAnalyticsForWindow,
  type AnalyticsWindowId,
} from '../db/capabilityAnalytics'
import {
  countConcurrentAsyncJobsForSlug,
  countJobsByStatusForSlug,
  listRecentFailureClassesForSlug,
  listRecentJobsForSellerHistory,
} from '../db/capabilityJobs'
import {
  getNotificationDeliveryStatsForSlugWindow,
  listRecentNotificationDeliveriesForSlug,
} from '../db/capabilityNotificationDeliveries'
import {
  dispatchCapabilityNotificationTest,
  retryFailedCapabilityNotificationDelivery,
} from '../lib/capabilityAsyncNotifications'
import {
  consumeSellerChallenge,
  getSellerChallengeIfValid,
  insertSellerChallenge,
} from '../db/capabilitySellerChallenges'
import {
  clearCapabilityExecutionPauses,
  getResourceBySlug,
  listSellerCapabilitiesMeta,
  updateCapabilityNotificationSettings,
  updateCapabilityPolicyFields,
  updateCapabilityResource,
} from '../db/resources'
import {
  countCapabilityExecutionStartsSince,
} from '../lib/capabilityPolicy'
import {
  evaluateOriginTrust,
  parseCapabilityEndpoint,
} from '../lib/capabilityOriginTrust'
import {
  issueSellerJwt,
  sellerJwtNotConfiguredResponse,
  verifySellerJwt,
  verifyWalletSignature,
} from '../lib/capabilitySellerSession'
import { createCapabilitySellerChallengeId } from '../lib/ids'
import { parseReceiverAddressForResource } from '../lib/receiverAddress'
import {
  normalizeCapabilityDeliveryMode,
} from '../lib/deliveryMode'
import {
  parseCapabilityExposure,
  parseCapabilityMcpType,
  isValidHttpMethod,
  parseNonEmptyString,
  parseReceiptMode,
} from '../lib/sellValidation'
import { badRequest, json, notFound } from '../lib/response'
import { nowIso } from '../lib/time'
import { buildInternalCapabilityDescriptor } from '../lib/capabilityDescriptor'
import { buildCapabilityInsights } from '../lib/capabilityInsights'
import { deriveResultRetentionPublicState } from '../lib/capabilityResultSemantics'
import { publicResourceDefinition } from './resource'
import type { CapabilityLifecycle } from '../types/resource'
import type { Env } from '../types/env'

function parseLifecycle(raw: unknown): CapabilityLifecycle | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().toLowerCase()
  if (s === 'active' || s === 'disabled' || s === 'archived') return s
  return null
}

export async function requireSellerWallet(
  env: Env,
  req: Request,
): Promise<{ wallet: string } | Response> {
  const auth = req.headers.get('authorization')?.trim()
  if (!auth?.toLowerCase().startsWith('bearer ')) {
    return json({ ok: false, error: 'Bearer token required', code: 'UNAUTHORIZED' }, { status: 401 })
  }
  const token = auth.slice(7).trim()
  if (!env.CAPABILITY_SELLER_JWT_SECRET?.trim()) {
    return sellerJwtNotConfiguredResponse()
  }
  const wallet = await verifySellerJwt(env, token)
  if (!wallet) {
    return json({ ok: false, error: 'Invalid or expired session', code: 'UNAUTHORIZED' }, { status: 401 })
  }
  return { wallet }
}

export async function assertCapabilityOwned(
  env: Env,
  slug: string,
  walletLower: string,
): Promise<
  | { ok: true; resource: NonNullable<Awaited<ReturnType<typeof getResourceBySlug>>> }
  | { ok: false; res: Response }
> {
  const resource = await getResourceBySlug(env.DB, slug)
  if (!resource || resource.sellType !== 'capability') {
    return { ok: false, res: notFound('Capability not found') }
  }
  if (resource.receiverAddress.toLowerCase() !== walletLower) {
    return {
      ok: false,
      res: json({ ok: false, error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 }),
    }
  }
  return { ok: true, resource }
}

export async function policySnapshotForSeller(
  env: Env,
  resource: NonNullable<Awaited<ReturnType<typeof getResourceBySlug>>>,
): Promise<Record<string, unknown>> {
  const concurrent = await countConcurrentAsyncJobsForSlug(env.DB, resource.slug)
  const cooldownSec = resource.capabilityCooldownSeconds
  const lastMs = resource.capabilityLastExecutionAt
    ? Date.parse(resource.capabilityLastExecutionAt)
    : NaN
  let cooldown_remaining_seconds: number | null = null
  if (
    cooldownSec != null &&
    cooldownSec > 0 &&
    Number.isFinite(lastMs)
  ) {
    const elapsed = (Date.now() - lastMs) / 1000
    if (elapsed < cooldownSec) {
      cooldown_remaining_seconds = Math.ceil(cooldownSec - elapsed)
    }
  }
  const max = resource.capabilityMaxConcurrentAsync
  const now = Date.now()
  const autoMs = resource.capabilityAutoPausedUntil
    ? Date.parse(resource.capabilityAutoPausedUntil)
    : NaN
  const manMs = resource.capabilityManualPausedUntil
    ? Date.parse(resource.capabilityManualPausedUntil)
    : NaN
  const auto_pause_active =
    Number.isFinite(autoMs) && autoMs > now
  const manual_pause_active =
    Number.isFinite(manMs) && manMs > now

  const [
    executions_24h,
    executions_7d,
    policy_denials_24h,
    policy_denials_7d,
  ] = await Promise.all([
    countCapabilityExecutionStartsSince(env.DB, resource.slug, '-24 hours'),
    countCapabilityExecutionStartsSince(env.DB, resource.slug, '-7 days'),
    countCapabilityPolicyDeniedForSlugWindow(env.DB, resource.slug, '-24 hours'),
    countCapabilityPolicyDeniedForSlugWindow(env.DB, resource.slug, '-7 days'),
  ])

  const cap24 = resource.capabilityMaxExecutionsPer24h
  const cap7 = resource.capabilityMaxExecutionsPer7d
  const remaining_24h =
    cap24 != null && cap24 > 0 ? Math.max(0, cap24 - executions_24h) : null
  const remaining_7d =
    cap7 != null && cap7 > 0 ? Math.max(0, cap7 - executions_7d) : null

  let current_block: string | null = null
  if (manual_pause_active) current_block = 'manual_pause'
  else if (auto_pause_active) current_block = 'auto_pause'
  else if (cooldown_remaining_seconds != null && cooldown_remaining_seconds > 0) {
    current_block = 'cooldown'
  } else if (max != null && max > 0 && concurrent >= max) {
    current_block = 'max_concurrency'
  } else if (cap24 != null && cap24 > 0 && executions_24h >= cap24) {
    current_block = 'execution_cap_24h'
  } else if (cap7 != null && cap7 > 0 && executions_7d >= cap7) {
    current_block = 'execution_cap_7d'
  }

  return {
    cooldown_seconds: cooldownSec,
    max_concurrent_async: max,
    last_execution_at: resource.capabilityLastExecutionAt,
    concurrent_async_jobs: concurrent,
    cooldown_remaining_seconds,
    at_concurrency_limit: max != null && max > 0 && concurrent >= max,
    max_executions_per_24h: cap24,
    max_executions_per_7d: cap7,
    executions_started_24h: executions_24h,
    executions_started_7d: executions_7d,
    remaining_executions_24h: remaining_24h,
    remaining_executions_7d: remaining_7d,
    auto_pause_enabled: resource.capabilityAutoPauseEnabled,
    auto_pause_threshold: resource.capabilityAutoPauseThreshold,
    auto_pause_window_seconds: resource.capabilityAutoPauseWindowSeconds,
    auto_pause_duration_seconds: resource.capabilityAutoPauseDurationSeconds,
    auto_paused_until: resource.capabilityAutoPausedUntil,
    auto_pause_reason: resource.capabilityAutoPauseReason,
    manual_paused_until: resource.capabilityManualPausedUntil,
    auto_pause_active,
    manual_pause_active,
    policy_denials_24h,
    policy_denials_7d,
    current_policy_block: current_block,
  }
}

export function sellerCapabilityResourceView(
  resource: NonNullable<Awaited<ReturnType<typeof getResourceBySlug>>>,
  env: Env,
): Record<string, unknown> {
  const base = publicResourceDefinition(resource, env) as Record<string, unknown>
  base.notification = {
    enabled: resource.capabilityNotifyEnabled,
    email: resource.capabilityNotifyEmail,
    webhook_url: resource.capabilityNotifyWebhookUrl,
    email_enabled: resource.capabilityNotifyEmailEnabled,
    webhook_enabled: resource.capabilityNotifyWebhookEnabled,
    on_complete: resource.capabilityNotifyOnComplete,
    on_fail: resource.capabilityNotifyOnFail,
  }
  base.policy = {
    cooldown_seconds: resource.capabilityCooldownSeconds,
    max_concurrent_async: resource.capabilityMaxConcurrentAsync,
    last_execution_at: resource.capabilityLastExecutionAt,
    max_executions_per_24h: resource.capabilityMaxExecutionsPer24h,
    max_executions_per_7d: resource.capabilityMaxExecutionsPer7d,
    auto_pause_enabled: resource.capabilityAutoPauseEnabled,
    auto_pause_threshold: resource.capabilityAutoPauseThreshold,
    auto_pause_window_seconds: resource.capabilityAutoPauseWindowSeconds,
    auto_pause_duration_seconds: resource.capabilityAutoPauseDurationSeconds,
    auto_paused_until: resource.capabilityAutoPausedUntil,
    auto_pause_reason: resource.capabilityAutoPauseReason,
    manual_paused_until: resource.capabilityManualPausedUntil,
  }
  base.capability_exposure = resource.capabilityExposure ?? 'api'
  base.mcp_name = resource.mcpName ?? null
  base.mcp_description = resource.mcpDescription ?? null
  base.mcp_type = resource.mcpType ?? null
  base.mcp_requires_payment =
    resource.mcpRequiresPayment == null ? true : resource.mcpRequiresPayment
  base.created_at = resource.createdAt
  base.updated_at = resource.updatedAt
  return base
}

/** GET /api/capability/seller/analytics/summary */
export async function handleGetSellerAnalyticsSummary(
  env: Env,
  req: Request,
): Promise<Response> {
  const auth = await requireSellerWallet(env, req)
  if (auth instanceof Response) return auth

  const rows = await listSellerCapabilitiesMeta(env.DB, auth.wallet)
  const slugs = rows.map((r) => r.slug)
  const bySlug = await getCapabilityAnalyticsForSlugs(env.DB, slugs)

  const capabilities = rows.map((row) => {
    const a =
      bySlug.get(row.slug) ??
      ({
        slug: row.slug,
        total_jobs: 0,
        completed_count: 0,
        failed_count: 0,
        retry_events: 0,
        avg_duration_ms: null,
        last_job_created_at: null,
        last_success_at: null,
        last_failure_at: null,
        full_result_still_available: 0,
      } as const)
    const terminal = a.completed_count + a.failed_count
    const success_rate =
      terminal > 0 ? a.completed_count / terminal : null
    const result_availability_rate =
      a.completed_count > 0
        ? a.full_result_still_available / a.completed_count
        : null
    return {
      slug: row.slug,
      label: row.label,
      capability_name: row.capabilityName,
      capability_lifecycle: row.capabilityLifecycle,
      capability_origin_trust: row.capabilityOriginTrust,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      analytics: {
        ...a,
        success_rate,
        result_availability_rate,
      },
    }
  })

  return json({ ok: true, capabilities })
}

/** POST /api/capability/seller/challenge */
export async function handlePostCapabilitySellerChallenge(
  env: Env,
  req: Request,
): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('Invalid JSON body')
  }
  const w = typeof (body as Record<string, unknown>).wallet === 'string'
    ? (body as Record<string, unknown>).wallet
    : ''
  const parsed = parseReceiverAddressForResource(w)
  if (!parsed.ok) return badRequest(parsed.message)

  const id = createCapabilitySellerChallengeId()
  const exp = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  const message = [
    '402.earth Capability Seller Auth',
    `Wallet: ${parsed.value}`,
    `Challenge ID: ${id}`,
    `Expires: ${exp}`,
    '',
    'Sign this message to obtain a seller session for allowlist and capability management.',
  ].join('\n')

  await insertSellerChallenge(env.DB, {
    id,
    wallet: parsed.value,
    message,
    expiresAt: exp,
  })

  return json({
    ok: true,
    challenge_id: id,
    message,
    expires_at: exp,
  })
}

/** POST /api/capability/seller/auth */
export async function handlePostCapabilitySellerAuth(
  env: Env,
  req: Request,
): Promise<Response> {
  if (!env.CAPABILITY_SELLER_JWT_SECRET?.trim()) {
    return sellerJwtNotConfiguredResponse()
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('Invalid JSON body')
  }
  const o = body as Record<string, unknown>
  const walletParsed = parseReceiverAddressForResource(
    typeof o.wallet === 'string' ? o.wallet : '',
  )
  if (!walletParsed.ok) return badRequest(walletParsed.message)
  const challengeId = typeof o.challenge_id === 'string' ? o.challenge_id.trim() : ''
  const sig = typeof o.signature === 'string' ? o.signature.trim() : ''
  if (!challengeId || !sig.startsWith('0x')) {
    return badRequest('challenge_id and signature (0x…) are required')
  }

  const ch = await getSellerChallengeIfValid(env.DB, challengeId, walletParsed.value)
  if (!ch) {
    return json(
      { ok: false, error: 'Invalid or expired challenge', code: 'CHALLENGE_INVALID' },
      { status: 400 },
    )
  }

  const okSig = await verifyWalletSignature({
    wallet: walletParsed.value,
    message: ch.message,
    signature: sig as `0x${string}`,
  })
  if (!okSig) {
    return json({ ok: false, error: 'Signature verification failed', code: 'BAD_SIGNATURE' }, { status: 401 })
  }

  await consumeSellerChallenge(env.DB, challengeId)

  const token = await issueSellerJwt(env, walletParsed.value)
  if (!token) {
    return sellerJwtNotConfiguredResponse()
  }

  await insertCapabilityAuditEvent(env.DB, {
    eventType: 'seller_session_issued',
    actorScope: 'seller',
    actorIdentifier: walletParsed.value,
    statusSummary: 'jwt issued',
  })

  return json({
    ok: true,
    token,
    expires_in_seconds: 8 * 3600,
    wallet: walletParsed.value,
  })
}

/** GET /api/capability/seller/allowlist */
export async function handleGetSellerAllowlist(
  env: Env,
  req: Request,
  url: URL,
): Promise<Response> {
  const auth = await requireSellerWallet(env, req)
  if (auth instanceof Response) return auth

  const recvRaw = url.searchParams.get('receiverAddress')?.trim() ?? ''
  const recv = parseReceiverAddressForResource(recvRaw)
  if (!recv.ok) return badRequest(recv.message)
  if (recv.value !== auth.wallet) {
    return json({ ok: false, error: 'receiverAddress must match signed wallet', code: 'FORBIDDEN' }, { status: 403 })
  }

  const rows = await listAllowlistForReceiver(env.DB, recv.value)
  return json({
    ok: true,
    receiver_address: recv.value,
    entries: rows,
  })
}

/** POST /api/capability/seller/allowlist */
export async function handlePostSellerAllowlist(
  env: Env,
  req: Request,
): Promise<Response> {
  const auth = await requireSellerWallet(env, req)
  if (auth instanceof Response) return auth

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('Invalid JSON body')
  }
  const o = body as Record<string, unknown>
  const recv = parseReceiverAddressForResource(
    typeof o.receiver_address === 'string'
      ? o.receiver_address
      : typeof o.receiverAddress === 'string'
        ? o.receiverAddress
        : '',
  )
  if (!recv.ok) return badRequest(recv.message)
  if (recv.value !== auth.wallet) {
    return json({ ok: false, error: 'receiver_address must match session wallet', code: 'FORBIDDEN' }, { status: 403 })
  }

  const host = normalizeAllowlistHost(typeof o.host === 'string' ? o.host : '')
  if (!host) return badRequest('host is required')

  const ins = await insertAllowlistEntry(env.DB, {
    receiverAddressLower: recv.value,
    hostLower: host,
    note: typeof o.note === 'string' ? o.note : null,
    source: 'seller_ui',
    createdByScope: 'seller',
    createdByIdentifier: auth.wallet,
  })
  if (!ins.ok) {
    return json({ ok: false, error: 'Duplicate host', code: 'DUPLICATE' }, { status: 409 })
  }

  await insertCapabilityAuditEvent(env.DB, {
    eventType: 'allowlist_host_added',
    actorScope: 'seller',
    actorIdentifier: auth.wallet,
    statusSummary: `allowlist ${host}`,
    metadata: { receiver: recv.value, host },
  })

  return json({ ok: true, id: ins.id, receiver_address: recv.value, host })
}

/** DELETE /api/capability/seller/allowlist */
export async function handleDeleteSellerAllowlist(
  env: Env,
  req: Request,
  url: URL,
): Promise<Response> {
  const auth = await requireSellerWallet(env, req)
  if (auth instanceof Response) return auth

  let receiverRaw = url.searchParams.get('receiverAddress')?.trim() ?? ''
  let hostRaw = url.searchParams.get('host')?.trim() ?? ''
  if (!receiverRaw || !hostRaw) {
    try {
      const body = await req.json()
      const o = body as Record<string, unknown>
      receiverRaw =
        typeof o.receiver_address === 'string'
          ? o.receiver_address
          : typeof o.receiverAddress === 'string'
            ? o.receiverAddress
            : ''
      hostRaw = typeof o.host === 'string' ? o.host : ''
    } catch {
      /* ignore */
    }
  }
  const recv = parseReceiverAddressForResource(receiverRaw)
  if (!recv.ok) return badRequest(recv.message)
  if (recv.value !== auth.wallet) {
    return json({ ok: false, error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
  }
  const host = normalizeAllowlistHost(hostRaw)
  if (!host) return badRequest('host is required')

  const removed = await deleteAllowlistEntry(env.DB, recv.value, host)
  if (!removed) {
    return json({ ok: false, error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  await insertCapabilityAuditEvent(env.DB, {
    eventType: 'allowlist_host_removed',
    actorScope: 'seller',
    actorIdentifier: auth.wallet,
    statusSummary: `removed ${host}`,
    metadata: { receiver: recv.value, host },
  })

  return json({ ok: true, receiver_address: recv.value, host })
}

/** GET /api/capability/seller/capability/:slug — seller control plane; JWT + ownership. */
export async function handleGetSellerCapabilityDetail(
  env: Env,
  req: Request,
  slug: string,
): Promise<Response> {
  const auth = await requireSellerWallet(env, req)
  if (auth instanceof Response) return auth
  const owned = await assertCapabilityOwned(env, slug, auth.wallet)
  if (!owned.ok) return owned.res

  const jobsByStatus = await countJobsByStatusForSlug(env.DB, slug)
  const recentJobsRaw = await listRecentJobsForSellerHistory(env.DB, slug, 25)
  const analytics = await getCapabilityAnalyticsForSlug(env.DB, slug)
  if (!analytics) {
    return json(
      { ok: false, error: 'Could not load analytics' },
      { status: 500 },
    )
  }
  const failClasses = await listRecentFailureClassesForSlug(env.DB, slug, 8)
  const recentNotifications = await listRecentNotificationDeliveriesForSlug(
    env.DB,
    { slug, limit: 15 },
  )
  const allowRows = await listAllowlistForReceiver(
    env.DB,
    owned.resource.receiverAddress,
  )

  const a = analytics
  const terminal = a.completed_count + a.failed_count
  const success_rate = terminal > 0 ? a.completed_count / terminal : null
  const result_availability_rate =
    a.completed_count > 0
      ? a.full_result_still_available / a.completed_count
      : null

  const insights = buildCapabilityInsights({
    resource: owned.resource,
    analytics: a,
    recentFailureClasses: failClasses,
  })

  const recent_jobs = recentJobsRaw.map((j) => ({
    ...j,
    result_retention_state: deriveResultRetentionPublicState({
      status: j.status,
      resultAvailable: j.result_available,
      resultStorageKind: j.result_storage_kind,
      resultPreview: j.result_preview,
      resultRetentionState: j.result_retention_state,
    }),
    final_outcome:
      j.status === 'completed'
        ? 'success'
        : j.status === 'failed'
          ? 'failed'
          : j.status === 'retry_scheduled'
            ? 'retrying'
            : j.status,
  }))

  const auditEvents = await listCapabilityAuditEventsForSlug(env.DB, slug, 5)
  const policy_snapshot = await policySnapshotForSeller(env, owned.resource)

  return json({
    ok: true,
    resource: sellerCapabilityResourceView(owned.resource, env),
    /** Phase 10.5 — internal normalized descriptor for future discovery/teams; not a public catalog schema. */
    capability_descriptor: buildInternalCapabilityDescriptor(owned.resource),
    policy_snapshot,
    jobs_by_status: jobsByStatus,
    analytics: {
      ...a,
      success_rate,
      result_availability_rate,
    },
    insights,
    recent_jobs,
    recent_failures_sample: failClasses,
    allowlist_entries: allowRows,
    recent_notifications: recentNotifications,
    audit_recent_summary: {
      sample_events: auditEvents,
    },
  })
}

function parseAnalyticsWindowParam(raw: string | null): AnalyticsWindowId {
  const s = raw?.trim().toLowerCase() ?? ''
  if (s === '24h' || s === '7d' || s === '30d') return s
  return '7d'
}

function windowToSinceModifier(w: AnalyticsWindowId): string {
  if (w === '24h') return '-24 hours'
  if (w === '7d') return '-7 days'
  return '-30 days'
}

/** GET /api/capability/seller/capability/:slug/analytics?window=24h|7d|30d */
export async function handleGetSellerCapabilityWindowAnalytics(
  env: Env,
  req: Request,
  slug: string,
): Promise<Response> {
  const auth = await requireSellerWallet(env, req)
  if (auth instanceof Response) return auth
  const owned = await assertCapabilityOwned(env, slug, auth.wallet)
  if (!owned.ok) return owned.res

  const url = new URL(req.url)
  const window = parseAnalyticsWindowParam(url.searchParams.get('window'))
  const { current, prior } = await getCapabilityAnalyticsForWindow(
    env.DB,
    slug,
    window,
  )
  const curSr = analyticsSuccessRate(current)
  const priSr = analyticsSuccessRate(prior)
  const curAr = analyticsResultAvailabilityRate(current)
  const priAr = analyticsResultAvailabilityRate(prior)
  const sinceMod = windowToSinceModifier(window)
  const notif = await getNotificationDeliveryStatsForSlugWindow(
    env.DB,
    slug,
    sinceMod,
  )
  const notifRate = notif.total > 0 ? notif.delivered / notif.total : null

  return json({
    ok: true,
    window,
    current: {
      ...current,
      success_rate: curSr,
      result_availability_rate: curAr,
    },
    prior_window: {
      ...prior,
      success_rate: priSr,
      result_availability_rate: priAr,
    },
    trends: {
      executions_delta: current.total_jobs - prior.total_jobs,
      successes_delta: current.completed_count - prior.completed_count,
      failures_delta: current.failed_count - prior.failed_count,
      success_rate_delta:
        curSr != null && priSr != null ? curSr - priSr : null,
    },
    notification_delivery: {
      ...notif,
      success_rate: notifRate,
    },
  })
}

/** GET /api/capability/seller/capability/:slug/notifications?limit=50&status=&channel= */
export async function handleGetSellerCapabilityNotifications(
  env: Env,
  req: Request,
  slug: string,
): Promise<Response> {
  const auth = await requireSellerWallet(env, req)
  if (auth instanceof Response) return auth
  const owned = await assertCapabilityOwned(env, slug, auth.wallet)
  if (!owned.ok) return owned.res

  const url = new URL(req.url)
  const lim = Number(url.searchParams.get('limit') ?? '50')
  const limit = Number.isFinite(lim)
    ? Math.min(100, Math.max(1, Math.floor(lim)))
    : 50
  const statusFilter = url.searchParams.get('status')?.trim() ?? null
  const channelFilter = url.searchParams.get('channel')?.trim() ?? null
  const deliveries = await listRecentNotificationDeliveriesForSlug(env.DB, {
    slug,
    limit,
    status: statusFilter,
    channel: channelFilter,
  })
  const failedInPage = deliveries.filter((d) => d.status === 'failed').length
  const deliveredInPage = deliveries.filter((d) => d.status === 'delivered')
    .length
  const pendingInPage = deliveries.filter((d) => d.status === 'pending').length
  const latest = deliveries[0] ?? null
  const latestFailed = deliveries.find((d) => d.status === 'failed') ?? null
  const latestDelivered =
    deliveries.find((d) => d.status === 'delivered') ?? null
  const attentionNeeded = failedInPage > 0 || pendingInPage > 0
  return json({
    ok: true,
    deliveries,
    filters_echo: {
      status: statusFilter,
      channel: channelFilter,
      limit,
    },
    summary: {
      total_returned: deliveries.length,
      failed_in_page: failedInPage,
      delivered_in_page: deliveredInPage,
      pending_in_page: pendingInPage,
      latest_status: latest?.status ?? null,
      latest_failed: latestFailed,
      latest_delivered: latestDelivered,
      delivery_health:
        attentionNeeded && failedInPage > 0
          ? 'needs_attention'
          : pendingInPage > 0
            ? 'pending_outcomes'
            : 'healthy',
    },
  })
}

/** POST /api/capability/seller/capability/:slug/notifications/test */
export async function handlePostSellerCapabilityNotificationTest(
  env: Env,
  req: Request,
  slug: string,
): Promise<Response> {
  const auth = await requireSellerWallet(env, req)
  if (auth instanceof Response) return auth
  const owned = await assertCapabilityOwned(env, slug, auth.wallet)
  if (!owned.ok) return owned.res
  if (owned.resource.sellType !== 'capability') {
    return json({ ok: false, error: 'Not a capability' }, { status: 400 })
  }
  const res = await dispatchCapabilityNotificationTest(env, owned.resource)
  if (!res.ok && res.results.length === 0) {
    return json(
      { ok: false, code: 'TEST_NOT_RUNNABLE', error: res.error ?? 'Cannot test' },
      { status: 400 },
    )
  }
  return json({ ok: res.ok, results: res.results, error: res.error ?? null })
}

/** POST /api/capability/seller/capability/:slug/notifications/:deliveryId/retry */
export async function handlePostSellerCapabilityNotificationRetry(
  env: Env,
  req: Request,
  slug: string,
  deliveryId: string,
): Promise<Response> {
  const auth = await requireSellerWallet(env, req)
  if (auth instanceof Response) return auth
  const owned = await assertCapabilityOwned(env, slug, auth.wallet)
  if (!owned.ok) return owned.res
  if (owned.resource.sellType !== 'capability') {
    return json({ ok: false, error: 'Not a capability' }, { status: 400 })
  }
  const out = await retryFailedCapabilityNotificationDelivery(env, {
    slug,
    prevDeliveryId: deliveryId,
    resource: owned.resource,
  })
  if (!out.ok) {
    return json(
      { ok: false, code: out.code, error: out.message },
      { status: out.httpStatus },
    )
  }
  return json({
    ok: true,
    new_delivery_id: out.new_delivery_id,
    status: out.status,
    error_message: out.error_message,
  })
}

/** GET /api/capability/seller/capability/:slug/audit */
export async function handleGetSellerCapabilityAudit(
  env: Env,
  req: Request,
  slug: string,
): Promise<Response> {
  const auth = await requireSellerWallet(env, req)
  if (auth instanceof Response) return auth
  const owned = await assertCapabilityOwned(env, slug, auth.wallet)
  if (!owned.ok) return owned.res

  const events = await listCapabilityAuditEventsForSlug(env.DB, slug, 100)
  return json({ ok: true, events })
}

/** PATCH /api/capability/seller/capability/:slug */
export async function handlePatchSellerCapability(
  env: Env,
  req: Request,
  slug: string,
): Promise<Response> {
  const auth = await requireSellerWallet(env, req)
  if (auth instanceof Response) return auth
  const owned = await assertCapabilityOwned(env, slug, auth.wallet)
  if (!owned.ok) return owned.res

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('Invalid JSON body')
  }
  const o = body as Record<string, unknown>
  const r = owned.resource

  const capName = parseNonEmptyString(
    o.capability_name ?? o.capabilityName ?? r.capabilityName ?? '',
    'capability_name',
  )
  if (!capName.ok) return badRequest(capName.message)

  const endpointStr = typeof o.endpoint === 'string' ? o.endpoint.trim() : r.endpoint ?? ''
  const ep = parseCapabilityEndpoint(endpointStr)
  if (!ep.ok) {
    return json({ ok: false, error: ep.message, code: ep.code }, { status: 400 })
  }

  const methodRaw = parseNonEmptyString(
    o.http_method ?? o.httpMethod ?? r.httpMethod ?? 'GET',
    'http_method',
  )
  if (!methodRaw.ok) return badRequest(methodRaw.message)
  const httpMethod = methodRaw.value.toUpperCase()
  if (!isValidHttpMethod(httpMethod)) {
    return badRequest('http_method must be GET, POST, PUT, PATCH, or DELETE')
  }

  const inputFormat = parseNonEmptyString(
    o.input_format ?? o.inputFormat ?? r.inputFormat ?? '',
    'input_format',
  )
  if (!inputFormat.ok) return badRequest(inputFormat.message)

  const resultFormat = parseNonEmptyString(
    o.result_format ?? o.resultFormat ?? r.resultFormat ?? '',
    'result_format',
  )
  if (!resultFormat.ok) return badRequest(resultFormat.message)

  const receiptParsed = parseReceiptMode(
    o.receipt_mode ?? o.receiptMode ?? r.receiptMode ?? 'standard',
  )
  if (!receiptParsed.ok) return badRequest(receiptParsed.message)

  const exposureParsed = parseCapabilityExposure(
    o.capability_exposure ?? o.capabilityExposure ?? r.capabilityExposure ?? 'api',
  )
  if (!exposureParsed.ok) return badRequest(exposureParsed.message)
  const capabilityExposure = exposureParsed.value
  const mcpTypeParsed = parseCapabilityMcpType(
    o.mcp_type ?? o.mcpType ?? r.mcpType ?? (capabilityExposure === 'api' ? null : 'tool'),
  )
  if (!mcpTypeParsed.ok) return badRequest(mcpTypeParsed.message)
  const mcpType = mcpTypeParsed.value
  const mcpNameRaw =
    typeof o.mcp_name === 'string'
      ? o.mcp_name.trim()
      : typeof o.mcpName === 'string'
        ? o.mcpName.trim()
        : typeof r.mcpName === 'string'
          ? r.mcpName.trim()
          : ''
  const mcpDescriptionRaw =
    typeof o.mcp_description === 'string'
      ? o.mcp_description.trim()
      : typeof o.mcpDescription === 'string'
        ? o.mcpDescription.trim()
        : typeof r.mcpDescription === 'string'
          ? r.mcpDescription.trim()
          : ''
  const mcpRequiresPaymentRaw =
    o.mcp_requires_payment ??
    o.mcpRequiresPayment ??
    r.mcpRequiresPayment ??
    true
  const mcpRequiresPayment =
    typeof mcpRequiresPaymentRaw === 'boolean' ? mcpRequiresPaymentRaw : true

  const deliveryRaw =
    typeof o.delivery_mode === 'string'
      ? o.delivery_mode
      : typeof o.deliveryMode === 'string'
        ? o.deliveryMode
        : r.deliveryMode
  const deliveryMode = normalizeCapabilityDeliveryMode(
    deliveryRaw != null ? String(deliveryRaw) : 'direct',
  )

  const lcParsed = o.capability_lifecycle ?? o.capabilityLifecycle
  const previousLifecycle: CapabilityLifecycle =
    r.capabilityLifecycle ?? 'active'
  let lifecycle: CapabilityLifecycle = previousLifecycle
  const pl = parseLifecycle(lcParsed)
  if (pl != null) lifecycle = pl

  if (lifecycle !== previousLifecycle) {
    if (lifecycle === 'disabled') {
      await insertCapabilityAuditEvent(env.DB, {
        eventType: 'capability_disabled',
        slug,
        actorScope: 'seller',
        actorIdentifier: auth.wallet,
        statusSummary: 'disabled',
      })
    } else if (lifecycle === 'archived') {
      await insertCapabilityAuditEvent(env.DB, {
        eventType: 'capability_archived',
        slug,
        actorScope: 'seller',
        actorIdentifier: auth.wallet,
        statusSummary: 'archived',
      })
    } else if (lifecycle === 'active') {
      await insertCapabilityAuditEvent(env.DB, {
        eventType: 'capability_enabled',
        slug,
        actorScope: 'seller',
        actorIdentifier: auth.wallet,
        statusSummary: 'active',
        metadata: { from: previousLifecycle },
      })
    }
  }

  const recv = r.receiverAddress.toLowerCase()
  const allow = await isHostAllowlistedForReceiver(env.DB, recv, ep.hostname)
  const trustEv = evaluateOriginTrust({
    env,
    hostname: ep.hostname,
    receiverAddressLower: recv,
    isOnAllowlist: allow,
  })

  const t = nowIso()
  await updateCapabilityResource(env.DB, slug, {
    label: capName.value,
    capabilityName: capName.value,
    endpoint: ep.canonicalUrl,
    httpMethod,
    inputFormat: inputFormat.value,
    resultFormat: resultFormat.value,
    receiptMode: receiptParsed.value,
    deliveryMode,
    capabilityEndpointCanonical: ep.canonicalUrl,
    capabilityOriginHost: ep.hostname,
    capabilityOriginTrust: trustEv.trust,
    capabilityLifecycle: lifecycle,
    capabilityExposure,
    mcpName:
      capabilityExposure === 'api'
        ? null
        : mcpNameRaw || capName.value,
    mcpDescription:
      capabilityExposure === 'api' ? null : mcpDescriptionRaw || null,
    mcpType: capabilityExposure === 'api' ? null : mcpType,
    mcpRequiresPayment: capabilityExposure === 'api' ? null : mcpRequiresPayment,
    updatedAt: t,
  })

  let notifyEmail = r.capabilityNotifyEmail
  let notifyWebhook = r.capabilityNotifyWebhookUrl
  let notifyEnabled = r.capabilityNotifyEnabled
  let notifyOnComplete = r.capabilityNotifyOnComplete
  let notifyOnFail = r.capabilityNotifyOnFail
  let notifyEmailEnabled = r.capabilityNotifyEmailEnabled
  let notifyWebhookEnabled = r.capabilityNotifyWebhookEnabled
  if (typeof o.notify_email === 'string') {
    notifyEmail = o.notify_email.trim() === '' ? null : o.notify_email.trim()
  }
  if (typeof o.notify_webhook_url === 'string') {
    notifyWebhook =
      o.notify_webhook_url.trim() === '' ? null : o.notify_webhook_url.trim()
  }
  if (typeof o.notify_enabled === 'boolean') {
    notifyEnabled = o.notify_enabled
  }
  if (typeof o.notify_on_complete === 'boolean') {
    notifyOnComplete = o.notify_on_complete
  }
  if (typeof o.notify_on_fail === 'boolean') {
    notifyOnFail = o.notify_on_fail
  }
  if (typeof o.notify_email_enabled === 'boolean') {
    notifyEmailEnabled = o.notify_email_enabled
  }
  if (typeof o.notify_webhook_enabled === 'boolean') {
    notifyWebhookEnabled = o.notify_webhook_enabled
  }

  let cooldownSec = r.capabilityCooldownSeconds
  let maxAsync = r.capabilityMaxConcurrentAsync
  if (Object.prototype.hasOwnProperty.call(o, 'capability_cooldown_seconds')) {
    const v = o.capability_cooldown_seconds
    if (v === null) {
      cooldownSec = null
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      if (v <= 0) cooldownSec = null
      else cooldownSec = Math.min(86400 * 30, Math.floor(v))
    } else {
      return badRequest(
        'capability_cooldown_seconds must be null or a positive integer (seconds)',
      )
    }
  }
  if (Object.prototype.hasOwnProperty.call(o, 'capability_max_concurrent_async')) {
    const v = o.capability_max_concurrent_async
    if (v === null) {
      maxAsync = null
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      if (v <= 0) maxAsync = null
      else maxAsync = Math.min(500, Math.floor(v))
    } else {
      return badRequest(
        'capability_max_concurrent_async must be null or a positive integer',
      )
    }
  }

  const clearExecutionPause =
    o.clear_capability_execution_pause === true ||
    o.clearCapabilityExecutionPause === true
  if (clearExecutionPause) {
    await clearCapabilityExecutionPauses(env.DB, slug, t)
    await insertCapabilityAuditEvent(env.DB, {
      eventType: 'capability_auto_pause_cleared',
      slug,
      actorScope: 'seller',
      actorIdentifier: auth.wallet,
      statusSummary: 'seller cleared execution pauses',
    })
  }

  let maxEx24 = r.capabilityMaxExecutionsPer24h
  let maxEx7 = r.capabilityMaxExecutionsPer7d
  const max24Raw =
    o.capability_max_executions_per_24h ?? o.capabilityMaxExecutionsPer24h
  if (
    Object.prototype.hasOwnProperty.call(o, 'capability_max_executions_per_24h') ||
    Object.prototype.hasOwnProperty.call(o, 'capabilityMaxExecutionsPer24h')
  ) {
    if (max24Raw === null) {
      maxEx24 = null
    } else if (typeof max24Raw === 'number' && Number.isFinite(max24Raw)) {
      if (max24Raw <= 0) maxEx24 = null
      else maxEx24 = Math.min(1_000_000, Math.floor(max24Raw))
    } else {
      return badRequest(
        'capability_max_executions_per_24h must be null or a positive integer',
      )
    }
  }
  const max7Raw =
    o.capability_max_executions_per_7d ?? o.capabilityMaxExecutionsPer7d
  if (
    Object.prototype.hasOwnProperty.call(o, 'capability_max_executions_per_7d') ||
    Object.prototype.hasOwnProperty.call(o, 'capabilityMaxExecutionsPer7d')
  ) {
    if (max7Raw === null) {
      maxEx7 = null
    } else if (typeof max7Raw === 'number' && Number.isFinite(max7Raw)) {
      if (max7Raw <= 0) maxEx7 = null
      else maxEx7 = Math.min(1_000_000, Math.floor(max7Raw))
    } else {
      return badRequest(
        'capability_max_executions_per_7d must be null or a positive integer',
      )
    }
  }

  let autoPauseEnabled = r.capabilityAutoPauseEnabled
  const apEnRaw =
    o.capability_auto_pause_enabled ?? o.capabilityAutoPauseEnabled
  if (
    Object.prototype.hasOwnProperty.call(o, 'capability_auto_pause_enabled') ||
    Object.prototype.hasOwnProperty.call(o, 'capabilityAutoPauseEnabled')
  ) {
    if (typeof apEnRaw === 'boolean') autoPauseEnabled = apEnRaw
    else {
      return badRequest('capability_auto_pause_enabled must be a boolean')
    }
  }

  let autoThresh = r.capabilityAutoPauseThreshold
  const thRaw =
    o.capability_auto_pause_threshold ?? o.capabilityAutoPauseThreshold
  if (
    Object.prototype.hasOwnProperty.call(o, 'capability_auto_pause_threshold') ||
    Object.prototype.hasOwnProperty.call(o, 'capabilityAutoPauseThreshold')
  ) {
    if (thRaw === null) {
      autoThresh = null
    } else if (typeof thRaw === 'number' && Number.isFinite(thRaw)) {
      if (thRaw <= 0) autoThresh = null
      else autoThresh = Math.min(1000, Math.max(2, Math.floor(thRaw)))
    } else {
      return badRequest(
        'capability_auto_pause_threshold must be null or an integer >= 2',
      )
    }
  }

  let autoWin = r.capabilityAutoPauseWindowSeconds
  const winRaw =
    o.capability_auto_pause_window_seconds ??
    o.capabilityAutoPauseWindowSeconds
  if (
    Object.prototype.hasOwnProperty.call(
      o,
      'capability_auto_pause_window_seconds',
    ) ||
    Object.prototype.hasOwnProperty.call(o, 'capabilityAutoPauseWindowSeconds')
  ) {
    if (winRaw === null) {
      autoWin = null
    } else if (typeof winRaw === 'number' && Number.isFinite(winRaw)) {
      if (winRaw <= 0) autoWin = null
      else
        autoWin = Math.min(86400 * 14, Math.max(60, Math.floor(winRaw)))
    } else {
      return badRequest(
        'capability_auto_pause_window_seconds must be null or seconds 60–1209600',
      )
    }
  }

  let autoDur = r.capabilityAutoPauseDurationSeconds
  const durRaw =
    o.capability_auto_pause_duration_seconds ??
    o.capabilityAutoPauseDurationSeconds
  if (
    Object.prototype.hasOwnProperty.call(
      o,
      'capability_auto_pause_duration_seconds',
    ) ||
    Object.prototype.hasOwnProperty.call(
      o,
      'capabilityAutoPauseDurationSeconds',
    )
  ) {
    if (durRaw === null) {
      autoDur = null
    } else if (typeof durRaw === 'number' && Number.isFinite(durRaw)) {
      if (durRaw <= 0) autoDur = null
      else autoDur = Math.min(86400 * 2, Math.max(60, Math.floor(durRaw)))
    } else {
      return badRequest(
        'capability_auto_pause_duration_seconds must be null or seconds 60–172800',
      )
    }
  }

  let manualPausedUntil = r.capabilityManualPausedUntil
  const manRaw =
    o.capability_manual_paused_until ?? o.capabilityManualPausedUntil
  if (
    Object.prototype.hasOwnProperty.call(o, 'capability_manual_paused_until') ||
    Object.prototype.hasOwnProperty.call(o, 'capabilityManualPausedUntil')
  ) {
    if (manRaw === null || manRaw === '') {
      manualPausedUntil = null
    } else if (typeof manRaw === 'string') {
      const u = Date.parse(manRaw.trim())
      if (!Number.isFinite(u)) {
        return badRequest('capability_manual_paused_until must be a valid ISO-8601 timestamp')
      }
      if (u <= Date.now()) {
        return badRequest(
          'capability_manual_paused_until must be in the future, or null to clear',
        )
      }
      const maxAhead = Date.now() + 30 * 86400 * 1000
      if (u > maxAhead) {
        return badRequest(
          'capability_manual_paused_until cannot be more than 30 days ahead',
        )
      }
      manualPausedUntil = new Date(u).toISOString()
    } else {
      return badRequest(
        'capability_manual_paused_until must be null or an ISO-8601 string',
      )
    }
  }

  await updateCapabilityNotificationSettings(env.DB, slug, {
    capabilityNotifyEmail: notifyEmail,
    capabilityNotifyWebhookUrl: notifyWebhook,
    capabilityNotifyEnabled: notifyEnabled,
    capabilityNotifyOnComplete: notifyOnComplete,
    capabilityNotifyOnFail: notifyOnFail,
    capabilityNotifyEmailEnabled: notifyEmailEnabled,
    capabilityNotifyWebhookEnabled: notifyWebhookEnabled,
    updatedAt: t,
  })

  await updateCapabilityPolicyFields(env.DB, slug, {
    cooldownSeconds: cooldownSec,
    maxConcurrentAsync: maxAsync,
    maxExecutionsPer24h: maxEx24,
    maxExecutionsPer7d: maxEx7,
    autoPauseEnabled,
    autoPauseThreshold: autoThresh,
    autoPauseWindowSeconds: autoWin,
    autoPauseDurationSeconds: autoDur,
    manualPausedUntil,
    updatedAt: t,
  })

  await insertCapabilityAuditEvent(env.DB, {
    eventType: 'capability_updated',
    slug,
    actorScope: 'seller',
    actorIdentifier: auth.wallet,
    statusSummary: 'configuration updated',
    metadata: { lifecycle },
  })

  const updated = await getResourceBySlug(env.DB, slug)
  if (!updated) {
    return json({ ok: false, error: 'Reload failed' }, { status: 500 })
  }

  return json({
    ok: true,
    resource: sellerCapabilityResourceView(updated, env),
  })
}
