import {
  countAuditEventsBySlugTypeWindow,
  countCapabilityPolicyDeniedForSlugsWindow,
  listCapabilityAuditEventsForJob,
} from '../db/capabilityAudit'
import {
  getCapabilityAnalyticsForSlug,
  getCapabilityAnalyticsForSlugs,
} from '../db/capabilityAnalytics'
import {
  countConcurrentAsyncJobsBySlugs,
  getCapabilityJobById,
  getMostRecentFailedJobSummaryForSlug,
  getSellerJobDiagnosticsWindowForSlug,
  listFailureClassHistogramForSlugWindow,
  listRecentFailureClassesForSlug,
  listSellerCapabilityJobsPaginated,
} from '../db/capabilityJobs'
import { getNotificationDeliveryStatsForSlugsWindow } from '../db/capabilityNotificationDeliveries'
import {
  listSellerCapabilitiesMeta,
  type SellerCapabilityMetaRow,
} from '../db/resources'
import { buildCapabilityInsights } from '../lib/capabilityInsights'
import {
  countCapabilityExecutionStartsForSlugsSince,
} from '../lib/capabilityPolicy'
import { deriveResultRetentionPublicState } from '../lib/capabilityResultSemantics'
import { json, notFound } from '../lib/response'
import {
  assertCapabilityOwned,
  policySnapshotForSeller,
  requireSellerWallet,
} from './capabilitySeller'
import type { ResourceDefinition, StoredDeliveryMode } from '../types/resource'
import type { Env } from '../types/env'

type HealthTier = 'ok' | 'watch' | 'attention'

const AUDIT_OPS_EVENTS = [
  'capability_execution_blocked',
  'capability_execution_gated',
] as const

const POLICY_DIAGNOSTIC_AUDIT_EVENTS = [
  'capability_policy_denied',
  'capability_auto_paused',
  'capability_auto_pause_cleared',
] as const

function parseDiagnosticsWindow(raw: string | null): '-24 hours' | '-7 days' | '-30 days' {
  const s = raw?.trim().toLowerCase() ?? ''
  if (s === '24h') return '-24 hours'
  if (s === '30d') return '-30 days'
  return '-7 days'
}

function parseSinceModifierForJobs(raw: string | null): string | null {
  const s = raw?.trim().toLowerCase() ?? ''
  if (s === '24h' || s === '1d') return '-24 hours'
  if (s === '7d') return '-7 days'
  if (s === '30d') return '-30 days'
  if (s === 'all' || s === '') return null
  return null
}

function computeOpsHealthTier(input: {
  lifecycle: string | null | undefined
  trust: string | null | undefined
  completedCount: number
  failedCount: number
  retryEvents: number
  fullStillAvail: number
}): HealthTier {
  const lc = input.lifecycle ?? 'active'
  if (lc === 'disabled' || lc === 'archived') return 'attention'
  if (input.trust === 'blocked') return 'attention'
  const term = input.completedCount + input.failedCount
  if (term >= 5 && input.failedCount > 0) {
    const fr = input.failedCount / term
    if (fr >= 0.35) return 'attention'
  }
  if (input.trust === 'unverified') return 'watch'
  if (input.retryEvents >= 3 && term >= 3) return 'watch'
  const completed = input.completedCount
  if (completed >= 4) {
    const lost = completed - (input.fullStillAvail ?? 0)
    if (lost > completed * 0.25) return 'watch'
  }
  return 'ok'
}

function metaRowToResourceStub(row: SellerCapabilityMetaRow): ResourceDefinition {
  return {
    slug: row.slug,
    label: row.label,
    sellType: 'capability',
    amount: '0',
    currency: 'USDC',
    network: 'base',
    receiverAddress: '',
    active: true,
    unlockType: 'capability',
    unlockValue: null,
    deliveryMode: row.deliveryMode as StoredDeliveryMode,
    protectedTtlSeconds: null,
    oneTimeUnlock: false,
    contentType: null,
    successRedirectPath: null,
    capabilityName: row.capabilityName,
    endpoint: null,
    httpMethod: null,
    inputFormat: null,
    resultFormat: null,
    receiptMode: row.receiptMode,
    capabilityEndpointCanonical: null,
    capabilityOriginHost: null,
    capabilityOriginTrust: row.capabilityOriginTrust as ResourceDefinition['capabilityOriginTrust'],
    capabilityLifecycle: row.capabilityLifecycle ?? 'active',
    capabilityNotifyEmail: null,
    capabilityNotifyWebhookUrl: null,
    capabilityNotifyEnabled: row.capabilityNotifyEnabled,
    capabilityNotifyOnComplete: true,
    capabilityNotifyOnFail: true,
    capabilityNotifyEmailEnabled: row.capabilityNotifyEmailEnabled,
    capabilityNotifyWebhookEnabled: row.capabilityNotifyWebhookEnabled,
    capabilityCooldownSeconds: row.capabilityCooldownSeconds,
    capabilityMaxConcurrentAsync: row.capabilityMaxConcurrentAsync,
    capabilityLastExecutionAt: row.capabilityLastExecutionAt,
    capabilityMaxExecutionsPer24h: row.capabilityMaxExecutionsPer24h,
    capabilityMaxExecutionsPer7d: row.capabilityMaxExecutionsPer7d,
    capabilityAutoPauseEnabled: row.capabilityAutoPauseEnabled,
    capabilityAutoPauseThreshold: row.capabilityAutoPauseThreshold,
    capabilityAutoPauseWindowSeconds: row.capabilityAutoPauseWindowSeconds,
    capabilityAutoPauseDurationSeconds: row.capabilityAutoPauseDurationSeconds,
    capabilityAutoPausedUntil: row.capabilityAutoPausedUntil,
    capabilityAutoPauseReason: row.capabilityAutoPauseReason,
    capabilityManualPausedUntil: row.capabilityManualPausedUntil,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function retentionIssueFromAnalytics(a: {
  completed_count: number
  full_result_still_available: number
}): boolean {
  const c = a.completed_count
  if (c < 4) return false
  const lost = c - a.full_result_still_available
  return lost > c * 0.25
}

/** GET /api/capability/seller/capabilities — Phase 7 seller capability index + cross-cap summary. */
export async function handleGetSellerCapabilitiesIndex(
  env: Env,
  req: Request,
): Promise<Response> {
  const auth = await requireSellerWallet(env, req)
  if (auth instanceof Response) return auth

  const meta = await listSellerCapabilitiesMeta(env.DB, auth.wallet)
  const slugs = meta.map((m) => m.slug)
  const since24 = '-24 hours'
  const since7 = '-7 days'
  const [
    bySlugAnalytics,
    concurrentBySlug,
    notifBySlug,
    auditBySlug,
    execStarts24,
    execStarts7,
    policyDenied24,
    policyDenied7,
    policyDiagAudit7,
  ] = await Promise.all([
    getCapabilityAnalyticsForSlugs(env.DB, slugs),
    countConcurrentAsyncJobsBySlugs(env.DB, slugs),
    getNotificationDeliveryStatsForSlugsWindow(env.DB, slugs, since7),
    countAuditEventsBySlugTypeWindow(env.DB, slugs, since7, [
      ...AUDIT_OPS_EVENTS,
    ]),
    countCapabilityExecutionStartsForSlugsSince(env.DB, slugs, since24),
    countCapabilityExecutionStartsForSlugsSince(env.DB, slugs, since7),
    countCapabilityPolicyDeniedForSlugsWindow(env.DB, slugs, since24),
    countCapabilityPolicyDeniedForSlugsWindow(env.DB, slugs, since7),
    countAuditEventsBySlugTypeWindow(env.DB, slugs, since7, [
      ...POLICY_DIAGNOSTIC_AUDIT_EVENTS,
    ]),
  ])

  const sevenMs = 7 * 24 * 60 * 60 * 1000
  const now = Date.now()

  const capabilities = await Promise.all(
    meta.map(async (row) => {
      const a =
        bySlugAnalytics.get(row.slug) ??
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
      const success_rate = terminal > 0 ? a.completed_count / terminal : null
      const result_availability_rate =
        a.completed_count > 0
          ? a.full_result_still_available / a.completed_count
          : null

      const concurrent = concurrentBySlug.get(row.slug) ?? 0
      const max = row.capabilityMaxConcurrentAsync
      const lastMs = row.capabilityLastExecutionAt
        ? Date.parse(row.capabilityLastExecutionAt)
        : NaN
      const cooldownSec = row.capabilityCooldownSeconds
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
      const at_concurrency_limit =
        max != null && max > 0 && concurrent >= max

      const executions_started_24h = execStarts24.get(row.slug) ?? 0
      const executions_started_7d = execStarts7.get(row.slug) ?? 0
      const cap24 = row.capabilityMaxExecutionsPer24h
      const cap7 = row.capabilityMaxExecutionsPer7d
      const remaining_24h =
        cap24 != null && cap24 > 0
          ? Math.max(0, cap24 - executions_started_24h)
          : null
      const remaining_7d =
        cap7 != null && cap7 > 0
          ? Math.max(0, cap7 - executions_started_7d)
          : null
      const autoMs = row.capabilityAutoPausedUntil
        ? Date.parse(row.capabilityAutoPausedUntil)
        : NaN
      const manMs = row.capabilityManualPausedUntil
        ? Date.parse(row.capabilityManualPausedUntil)
        : NaN
      const auto_pause_active =
        Number.isFinite(autoMs) && autoMs > now
      const manual_pause_active =
        Number.isFinite(manMs) && manMs > now
      const cap24_hit =
        cap24 != null && cap24 > 0 && executions_started_24h >= cap24
      const cap7_hit =
        cap7 != null && cap7 > 0 && executions_started_7d >= cap7
      const lcRow = row.capabilityLifecycle ?? 'active'
      const policy_blocked_execution =
        lcRow === 'active' &&
        (manual_pause_active ||
          auto_pause_active ||
          cap24_hit ||
          cap7_hit ||
          (cooldown_remaining_seconds != null &&
            cooldown_remaining_seconds > 0) ||
          at_concurrency_limit)

      const polDiag = policyDiagAudit7.get(row.slug) ?? new Map()
      const policy_denials_24h = policyDenied24.get(row.slug) ?? 0
      const policy_denials_7d = policyDenied7.get(row.slug) ?? 0

      const policy_summary = {
        cooldown_seconds: row.capabilityCooldownSeconds,
        max_concurrent_async: row.capabilityMaxConcurrentAsync,
        last_execution_at: row.capabilityLastExecutionAt,
        concurrent_async_jobs: concurrent,
        cooldown_remaining_seconds,
        at_concurrency_limit,
        max_executions_per_24h: cap24,
        max_executions_per_7d: cap7,
        executions_started_24h,
        executions_started_7d,
        remaining_executions_24h: remaining_24h,
        remaining_executions_7d: remaining_7d,
        auto_pause_enabled: row.capabilityAutoPauseEnabled,
        auto_pause_active,
        manual_pause_active,
        auto_paused_until: row.capabilityAutoPausedUntil,
        manual_paused_until: row.capabilityManualPausedUntil,
        policy_denials_24h,
        policy_denials_7d,
        policy_denied_audit_7d: polDiag.get('capability_policy_denied') ?? 0,
        auto_pause_events_7d: polDiag.get('capability_auto_paused') ?? 0,
        auto_pause_cleared_events_7d:
          polDiag.get('capability_auto_pause_cleared') ?? 0,
        policy_blocked_execution,
      }

      const notif = notifBySlug.get(row.slug) ?? {
        total: 0,
        delivered: 0,
        failed: 0,
        pending: 0,
      }
      const notif_rate =
        notif.total > 0 ? notif.delivered / notif.total : null

      const notification_summary = {
        enabled: row.capabilityNotifyEnabled,
        channels: {
          email: row.capabilityNotifyEmailEnabled,
          webhook: row.capabilityNotifyWebhookEnabled,
        },
        window_7d: {
          ...notif,
          success_rate: notif_rate,
        },
      }

      const auditMap = auditBySlug.get(row.slug) ?? new Map()
      const audit_blocked_7d = auditMap.get('capability_execution_blocked') ?? 0
      const audit_gated_7d = auditMap.get('capability_execution_gated') ?? 0

      const stub = metaRowToResourceStub(row)
      const failClasses = await listRecentFailureClassesForSlug(env.DB, row.slug, 8)
      const insights = buildCapabilityInsights({
        resource: stub,
        analytics: a,
        recentFailureClasses: failClasses,
      })
      const worstInsight = insights.reduce(
        (w, i) => {
          if (i.level === 'critical') return 'critical' as const
          if (i.level === 'warning' && w !== 'critical') return 'warning' as const
          return w
        },
        'ok' as 'ok' | 'warning' | 'critical',
      )

      const health_tier = computeOpsHealthTier({
        lifecycle: row.capabilityLifecycle,
        trust: row.capabilityOriginTrust,
        completedCount: a.completed_count,
        failedCount: a.failed_count,
        retryEvents: a.retry_events,
        fullStillAvail: a.full_result_still_available,
      })

      const retention_issue_indicator = retentionIssueFromAnalytics(a)

      return {
        slug: row.slug,
        label: row.label,
        capability_name: row.capabilityName,
        capability_lifecycle: row.capabilityLifecycle,
        capability_origin_trust: row.capabilityOriginTrust,
        delivery_mode: row.deliveryMode,
        receipt_mode: row.receiptMode,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
        last_execution_at: row.capabilityLastExecutionAt,
        last_job_created_at: a.last_job_created_at,
        last_success_at: a.last_success_at,
        last_failure_at: a.last_failure_at,
        total_executions: a.total_jobs,
        success_rate,
        result_availability_rate,
        retry_events: a.retry_events,
        retry_indicator_elevated: a.retry_events >= 3 && terminal >= 3,
        retention_issue_indicator,
        notification_summary,
        policy_summary,
        audit_signals_7d: {
          execution_blocked: audit_blocked_7d,
          execution_gated: audit_gated_7d,
        },
        insight_summary: {
          worst_level: worstInsight,
          codes: insights.map((i) => i.code),
        },
        health_tier,
        manage_path: `/manage/capability/${encodeURIComponent(row.slug)}`,
      }
    }),
  )

  const lifecycle_counts = { active: 0, disabled: 0, archived: 0 }
  let unhealthy_count = 0
  let recent_failure_slugs = 0
  let trust_issue_count = 0
  let policy_pressure_count = 0
  let policy_blocked_execution_count = 0
  let auto_pause_signal_count = 0
  let retention_issue_count = 0
  let notification_failure_recent = 0

  const slugs_unhealthy: string[] = []
  const slugs_recent_fail: string[] = []
  const slugs_trust: string[] = []
  const slugs_policy: string[] = []
  const slugs_policy_blocked: string[] = []
  const slugs_auto_pause_recent: string[] = []
  const slugs_retention: string[] = []
  const slugs_notif_fail: string[] = []

  for (const c of capabilities) {
    const lc = c.capability_lifecycle ?? 'active'
    if (lc === 'active') lifecycle_counts.active += 1
    else if (lc === 'disabled') lifecycle_counts.disabled += 1
    else if (lc === 'archived') lifecycle_counts.archived += 1

    if (c.health_tier === 'attention') {
      unhealthy_count += 1
      slugs_unhealthy.push(c.slug)
    }
    const lastFail = c.last_failure_at
      ? Date.parse(String(c.last_failure_at))
      : NaN
    if (Number.isFinite(lastFail) && now - lastFail <= sevenMs) {
      recent_failure_slugs += 1
      slugs_recent_fail.push(c.slug)
    }
    const tr = c.capability_origin_trust
    if (tr === 'blocked' || tr === 'unverified') {
      trust_issue_count += 1
      slugs_trust.push(c.slug)
    }
    const pol = c.policy_summary as {
      at_concurrency_limit?: boolean
      cooldown_remaining_seconds?: number | null
      policy_denials_24h?: number
      auto_pause_active?: boolean
      manual_pause_active?: boolean
      auto_pause_events_7d?: number
      policy_blocked_execution?: boolean
    }
    const aud = c.audit_signals_7d as { execution_blocked?: number }
    if (pol?.policy_blocked_execution === true) {
      policy_blocked_execution_count += 1
      slugs_policy_blocked.push(c.slug)
    }
    if ((pol?.auto_pause_events_7d ?? 0) > 0) {
      auto_pause_signal_count += 1
      slugs_auto_pause_recent.push(c.slug)
    }
    if (
      pol?.at_concurrency_limit ||
      (pol?.cooldown_remaining_seconds != null &&
        pol.cooldown_remaining_seconds > 0) ||
      (aud?.execution_blocked ?? 0) > 0 ||
      (pol?.policy_denials_24h ?? 0) > 0 ||
      pol?.auto_pause_active ||
      pol?.manual_pause_active
    ) {
      policy_pressure_count += 1
      slugs_policy.push(c.slug)
    }
    if (c.retention_issue_indicator) {
      retention_issue_count += 1
      slugs_retention.push(c.slug)
    }
    const w = c.notification_summary as {
      window_7d?: { failed?: number }
    }
    if ((w?.window_7d?.failed ?? 0) > 0) {
      notification_failure_recent += 1
      slugs_notif_fail.push(c.slug)
    }
  }

  const operations_summary = {
    total_capabilities: capabilities.length,
    lifecycle: lifecycle_counts,
    unhealthy_count,
    capabilities_with_recent_failures: recent_failure_slugs,
    capabilities_with_trust_issues: trust_issue_count,
    capabilities_with_policy_pressure: policy_pressure_count,
    capabilities_blocked_by_policy_now: policy_blocked_execution_count,
    capabilities_with_auto_pause_events_7d: auto_pause_signal_count,
    capabilities_with_retention_signals: retention_issue_count,
    capabilities_with_failed_notifications_7d: notification_failure_recent,
    quick_filters: {
      unhealthy_slugs: slugs_unhealthy.slice(0, 50),
      recent_failure_slugs: slugs_recent_fail.slice(0, 50),
      trust_issue_slugs: slugs_trust.slice(0, 50),
      policy_pressure_slugs: slugs_policy.slice(0, 50),
      policy_blocked_execution_slugs: slugs_policy_blocked.slice(0, 50),
      auto_pause_recent_slugs: slugs_auto_pause_recent.slice(0, 50),
      retention_issue_slugs: slugs_retention.slice(0, 50),
      notification_failed_slugs: slugs_notif_fail.slice(0, 50),
    },
  }

  return json({
    ok: true,
    operations_summary,
    capabilities,
  })
}

/** GET /api/capability/seller/capability/:slug/jobs — paginated execution history. */
export async function handleGetSellerCapabilityJobs(
  env: Env,
  req: Request,
  slug: string,
): Promise<Response> {
  const auth = await requireSellerWallet(env, req)
  if (auth instanceof Response) return auth
  const owned = await assertCapabilityOwned(env, slug, auth.wallet)
  if (!owned.ok) return owned.res

  const url = new URL(req.url)
  const limRaw = Number(url.searchParams.get('limit') ?? '20')
  const limit = Number.isFinite(limRaw) ? limRaw : 20
  const status = url.searchParams.get('status')?.trim() || null
  const failureClass = url.searchParams.get('failure_class')?.trim() || null
  const resultRetentionState =
    url.searchParams.get('result_retention_state')?.trim() || null
  const resultAvailableRaw = url.searchParams.get('result_available')?.trim().toLowerCase()
  const resultAvailable =
    resultAvailableRaw === 'yes' || resultAvailableRaw === 'no'
      ? (resultAvailableRaw as 'yes' | 'no')
      : null
  const sinceModifier = parseSinceModifierForJobs(
    url.searchParams.get('since') ?? url.searchParams.get('window'),
  )
  const cursorCreatedAt = url.searchParams.get('cursor_created_at')?.trim() || null
  const cursorId = url.searchParams.get('cursor_id')?.trim() || null

  const rows = await listSellerCapabilityJobsPaginated(env.DB, {
    slug,
    limit,
    cursorCreatedAt,
    cursorId,
    status,
    failureClass,
    resultRetentionState,
    resultAvailable,
    sinceModifier,
  })

  const jobs = rows.map((j) => ({
    id: j.id,
    attempt_id: j.attemptId,
    status: j.status,
    created_at: j.createdAt,
    updated_at: j.updatedAt,
    execution_started_at: j.executionStartedAt,
    execution_completed_at: j.executionCompletedAt,
    failed_at: j.failedAt,
    last_attempt_started_at: j.lastAttemptStartedAt,
    attempt_count: j.attemptCount,
    max_attempts: j.maxAttempts,
    next_retry_at: j.nextRetryAt,
    failure_class: j.failureClass,
    last_error_summary: j.lastErrorSummary,
    result_available: j.resultAvailable === 1,
    result_retention_state: deriveResultRetentionPublicState({
      status: j.status,
      resultAvailable: j.resultAvailable,
      resultStorageKind: j.resultStorageKind,
      resultPreview: j.resultPreview,
      resultRetentionState: j.resultRetentionState,
    }),
    result_preview_truncated:
      j.resultPreview != null && j.resultPreview.length > 200
        ? `${j.resultPreview.slice(0, 200)}…`
        : j.resultPreview,
    result_http_status: j.resultHttpStatus,
    result_storage_kind: j.resultStorageKind,
    result_expires_at: j.resultExpiresAt,
    delivery_mode: owned.resource.deliveryMode,
    final_outcome:
      j.status === 'completed'
        ? 'success'
        : j.status === 'failed'
          ? 'failed'
          : j.status === 'retry_scheduled'
            ? 'retrying'
            : j.status,
    trust_policy_block_summary:
      j.failureClass === 'trust'
        ? 'Trust / origin gate classified this failure.'
        : j.failureClass === 'validation'
          ? 'Validation or configuration blocked execution.'
          : null,
  }))

  const last = rows[rows.length - 1]
  const next_cursor =
    rows.length >= Math.min(100, Math.max(1, Math.floor(limit))) && last
      ? {
          cursor_created_at: last.createdAt,
          cursor_id: last.id,
        }
      : null

  return json({
    ok: true,
    slug,
    jobs,
    next_cursor,
    filters_echo: {
      status,
      failure_class: failureClass,
      result_retention_state: resultRetentionState,
      result_available: resultAvailable,
      since: sinceModifier,
    },
  })
}

/** GET /api/capability/seller/capability/:slug/jobs/:jobId — job drill-down. */
export async function handleGetSellerCapabilityJobDetail(
  env: Env,
  req: Request,
  slug: string,
  jobId: string,
): Promise<Response> {
  const auth = await requireSellerWallet(env, req)
  if (auth instanceof Response) return auth
  const owned = await assertCapabilityOwned(env, slug, auth.wallet)
  if (!owned.ok) return owned.res

  const job = await getCapabilityJobById(env.DB, jobId)
  if (!job || job.slug !== slug) {
    return notFound('Job not found')
  }

  const auditSample = await listCapabilityAuditEventsForJob(env.DB, slug, jobId, 12)
  const policy_snapshot = await policySnapshotForSeller(env, owned.resource)

  const capability_summary = {
    slug: owned.resource.slug,
    capability_name: owned.resource.capabilityName,
    delivery_mode: owned.resource.deliveryMode,
    receipt_mode: owned.resource.receiptMode,
    capability_lifecycle: owned.resource.capabilityLifecycle,
    capability_origin_trust: owned.resource.capabilityOriginTrust,
  }

  return json({
    ok: true,
    job: {
      id: job.id,
      attempt_id: job.attemptId,
      status: job.status,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
      execution_started_at: job.executionStartedAt,
      execution_completed_at: job.executionCompletedAt,
      failed_at: job.failedAt,
      last_attempt_started_at: job.lastAttemptStartedAt,
      attempt_count: job.attemptCount,
      max_attempts: job.maxAttempts,
      next_retry_at: job.nextRetryAt,
      failure_class: job.failureClass,
      last_error_summary: job.lastErrorSummary,
      result_available: job.resultAvailable === 1,
      result_retention_state: deriveResultRetentionPublicState({
        status: job.status,
        resultAvailable: job.resultAvailable,
        resultStorageKind: job.resultStorageKind,
        resultPreview: job.resultPreview,
        resultRetentionState: job.resultRetentionState,
      }),
      result_http_status: job.resultHttpStatus,
      result_content_type: job.resultContentType,
      result_size_bytes: job.resultSizeBytes,
      result_storage_kind: job.resultStorageKind,
      result_expires_at: job.resultExpiresAt,
      result_preview_truncated:
        job.resultPreview != null && job.resultPreview.length > 400
          ? `${job.resultPreview.slice(0, 400)}…`
          : job.resultPreview,
      final_outcome:
        job.status === 'completed'
          ? 'success'
          : job.status === 'failed'
            ? 'failed'
            : job.status === 'retry_scheduled'
              ? 'retrying'
              : job.status,
      retrieval_hint:
        job.status === 'completed' && job.resultAvailable === 1
          ? 'GET /api/capability-job/{jobId}/result while retention allows.'
          : job.status === 'completed'
            ? 'Full result is not available (preview-only, expired, or not stored).'
            : null,
    },
    capability_summary,
    policy_snapshot,
    audit_sample: auditSample.map((e) => ({
      id: e.id,
      created_at: e.created_at,
      event_type: e.event_type,
      actor_scope: e.actor_scope,
      status_summary: e.status_summary,
    })),
  })
}

/** GET /api/capability/seller/capability/:slug/diagnostics */
export async function handleGetSellerCapabilityDiagnostics(
  env: Env,
  req: Request,
  slug: string,
): Promise<Response> {
  const auth = await requireSellerWallet(env, req)
  if (auth instanceof Response) return auth
  const owned = await assertCapabilityOwned(env, slug, auth.wallet)
  if (!owned.ok) return owned.res

  const url = new URL(req.url)
  const sinceMod = parseDiagnosticsWindow(url.searchParams.get('window'))

  const analytics = await getCapabilityAnalyticsForSlug(env.DB, slug)
  if (!analytics) {
    return json({ ok: false, error: 'Could not load analytics' }, { status: 500 })
  }
  const failClasses = await listRecentFailureClassesForSlug(env.DB, slug, 8)
  const insights = buildCapabilityInsights({
    resource: owned.resource,
    analytics,
    recentFailureClasses: failClasses,
  })

  const windowRow = await getSellerJobDiagnosticsWindowForSlug(
    env.DB,
    slug,
    sinceMod,
  )
  const histogram = await listFailureClassHistogramForSlugWindow(
    env.DB,
    slug,
    sinceMod,
  )
  const recentFail = await getMostRecentFailedJobSummaryForSlug(env.DB, slug)

  const notif = await getNotificationDeliveryStatsForSlugsWindow(
    env.DB,
    [slug],
    sinceMod,
  )
  const n = notif.get(slug) ?? { total: 0, delivered: 0, failed: 0, pending: 0 }
  const notif_rate = n.total > 0 ? n.delivered / n.total : null

  const auditMap = await countAuditEventsBySlugTypeWindow(
    env.DB,
    [slug],
    sinceMod,
    [...AUDIT_OPS_EVENTS],
  )
  const am = auditMap.get(slug) ?? new Map()

  const policyDiagAudit = await countAuditEventsBySlugTypeWindow(
    env.DB,
    [slug],
    sinceMod,
    [...POLICY_DIAGNOSTIC_AUDIT_EVENTS],
  )
  const pm = policyDiagAudit.get(slug) ?? new Map()

  const lc = owned.resource.capabilityLifecycle ?? 'active'

  const policy_snapshot = await policySnapshotForSeller(env, owned.resource)

  return json({
    ok: true,
    window: sinceMod === '-24 hours' ? '24h' : sinceMod === '-30 days' ? '30d' : '7d',
    window_since_modifier: sinceMod,
    failure_class_distribution: histogram,
    most_recent_failure: recentFail,
    job_window_counts: windowRow,
    policy_snapshot,
    policy_audit_counts_window: {
      policy_denied: pm.get('capability_policy_denied') ?? 0,
      auto_paused: pm.get('capability_auto_paused') ?? 0,
      auto_pause_cleared: pm.get('capability_auto_pause_cleared') ?? 0,
    },
    trust_and_policy_signals: {
      lifecycle_state: lc,
      lifecycle_blocks_execution: lc !== 'active',
      trust_state: owned.resource.capabilityOriginTrust,
      audit_execution_blocked: am.get('capability_execution_blocked') ?? 0,
      audit_execution_gated: am.get('capability_execution_gated') ?? 0,
    },
    notification_delivery_window: {
      ...n,
      success_rate: notif_rate,
    },
    insights,
  })
}
