import { insertCapabilityAuditEvent } from '../db/capabilityAudit'
import { countConcurrentAsyncJobsForSlug } from '../db/capabilityJobs'
import {
  clearExpiredCapabilityPolicyPauses,
  getResourceBySlug,
  setCapabilityAutoPaused,
  updateCapabilityLastExecutionAt,
} from '../db/resources'
import { gateCapabilityExecution } from './capabilityExecutionGate'
import { nowIso } from './time'
import type { Env } from '../types/env'
import type { ResourceDefinition } from '../types/resource'

export type PolicyErr = {
  ok: false
  code: string
  httpStatus: number
  publicMessage: string
}
export type PolicyOk = { ok: true }

const DEFAULT_AUTO_PAUSE_THRESHOLD = 5
const DEFAULT_AUTO_PAUSE_WINDOW_SEC = 3600
const DEFAULT_AUTO_PAUSE_DURATION_SEC = 900

function lastExecutionMs(resource: ResourceDefinition): number | null {
  const s = resource.capabilityLastExecutionAt
  if (!s || String(s).trim() === '') return null
  const t = Date.parse(String(s))
  return Number.isNaN(t) ? null : t
}

function pauseUntilMs(resource: ResourceDefinition): {
  untilMs: number
  manual: boolean
} | null {
  const now = Date.now()
  const man = resource.capabilityManualPausedUntil
    ? Date.parse(resource.capabilityManualPausedUntil)
    : NaN
  const auto = resource.capabilityAutoPausedUntil
    ? Date.parse(resource.capabilityAutoPausedUntil)
    : NaN
  const manualOk = Number.isFinite(man) && man > now
  const autoOk = Number.isFinite(auto) && auto > now
  if (manualOk) return { untilMs: man, manual: true }
  if (autoOk) return { untilMs: auto, manual: false }
  return null
}

/** Batched execution-start counts for seller ops index (Phase 8). */
export async function countCapabilityExecutionStartsForSlugsSince(
  db: D1Database,
  slugs: string[],
  sinceModifier: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (slugs.length === 0) return out
  for (const s of slugs) out.set(s, 0)
  const ph = slugs.map(() => '?').join(',')
  const bind = [...slugs, sinceModifier]
  const r1 = await db
    .prepare(
      `SELECT slug, COUNT(*) as c FROM capability_async_jobs
       WHERE slug IN (${ph}) AND created_at >= datetime('now', ?)
       GROUP BY slug`,
    )
    .bind(...bind)
    .all<{ slug: string; c: number | null }>()
  for (const row of r1.results ?? []) {
    const slug = String(row.slug)
    out.set(slug, (out.get(slug) ?? 0) + (Number(row.c) || 0))
  }
  const r2 = await db
    .prepare(
      `SELECT slug, COUNT(*) as c FROM capability_audit_events
       WHERE slug IN (${ph}) AND event_type = 'capability_sync_execution_started'
         AND created_at >= datetime('now', ?)
       GROUP BY slug`,
    )
    .bind(...bind)
    .all<{ slug: string; c: number | null }>()
  for (const row of r2.results ?? []) {
    const slug = String(row.slug)
    out.set(slug, (out.get(slug) ?? 0) + (Number(row.c) || 0))
  }
  return out
}

export async function countCapabilityExecutionStartsSince(
  db: D1Database,
  slug: string,
  sinceModifier: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM capability_async_jobs j
         WHERE j.slug = ? AND j.created_at >= datetime('now', ?))
      + (SELECT COUNT(*) FROM capability_audit_events e
         WHERE e.slug = ? AND e.event_type = 'capability_sync_execution_started'
           AND e.created_at >= datetime('now', ?)) AS c`,
    )
    .bind(slug, sinceModifier, slug, sinceModifier)
    .first<{ c: number | null }>()
  return Number(row?.c) || 0
}

/**
 * Qualifying async failures for auto-pause: terminal failed jobs where failure is
 * operational (transport, upstream_client, permanent) — excludes trust and validation
 * misconfiguration so sellers are not auto-paused for allowlist/endpoint issues.
 */
export async function countQualifyingAsyncFailuresInWindow(
  db: D1Database,
  slug: string,
  windowSeconds: number,
): Promise<number> {
  const w = Math.min(86400 * 14, Math.max(60, Math.floor(windowSeconds)))
  const mod = `-${w} seconds`
  const row = await db
    .prepare(
      `SELECT COUNT(*) as c FROM capability_async_jobs
       WHERE slug = ?
         AND status = 'failed'
         AND failure_class IS NOT NULL
         AND failure_class NOT IN ('trust', 'validation')
         AND datetime(COALESCE(failed_at, updated_at)) >= datetime('now', ?)`,
    )
    .bind(slug, mod)
    .first<{ c: number | null }>()
  return Number(row?.c) || 0
}

export async function logCapabilityPolicyDenial(
  env: Env,
  input: {
    slug: string
    code: string
    mode: string
    detail?: Record<string, unknown>
  },
): Promise<void> {
  await insertCapabilityAuditEvent(env.DB, {
    eventType: 'capability_policy_denied',
    slug: input.slug,
    actorScope: 'system',
    statusSummary: input.code,
    metadata: { code: input.code, mode: input.mode, ...input.detail },
  })
}

/**
 * After a terminal async failure, optionally auto-pause the capability for a cooldown window.
 */
export async function maybeApplyCapabilityAutoPauseAfterAsyncFailure(
  env: Env,
  slug: string,
  failureClass: string | null,
): Promise<void> {
  if (failureClass === 'trust' || failureClass === 'validation') {
    return
  }
  const resource = await getResourceBySlug(env.DB, slug)
  if (!resource || resource.sellType !== 'capability') return
  if (!resource.capabilityAutoPauseEnabled) return
  if (resource.capabilityAutoPausedUntil) {
    const u = Date.parse(resource.capabilityAutoPausedUntil)
    if (Number.isFinite(u) && u > Date.now()) return
  }

  const threshold =
    resource.capabilityAutoPauseThreshold ?? DEFAULT_AUTO_PAUSE_THRESHOLD
  const windowSec =
    resource.capabilityAutoPauseWindowSeconds ?? DEFAULT_AUTO_PAUSE_WINDOW_SEC
  const durationSec =
    resource.capabilityAutoPauseDurationSeconds ?? DEFAULT_AUTO_PAUSE_DURATION_SEC

  const n = await countQualifyingAsyncFailuresInWindow(env.DB, slug, windowSec)
  if (n < threshold) return

  const t = nowIso()
  const until = new Date(Date.now() + durationSec * 1000).toISOString()
  const reason = `Auto-pause: ${n} qualifying failures within ${windowSec}s window (threshold ${threshold}).`
  await setCapabilityAutoPaused(env.DB, slug, {
    untilIso: until,
    reason,
    updatedAt: t,
  })
  await insertCapabilityAuditEvent(env.DB, {
    eventType: 'capability_auto_paused',
    slug,
    actorScope: 'system',
    statusSummary: reason,
    metadata: {
      failures_in_window: n,
      threshold,
      window_seconds: windowSec,
      duration_seconds: durationSec,
      paused_until: until,
    },
  })
}

/**
 * Product policy gates before starting execution (Phase 6 + Phase 8).
 * Cooldown, concurrency, execution caps, temporary pauses.
 */
/**
 * Same gates as execution, without audit noise — for catalog peek and payment-attempt precheck.
 */
export async function evaluateCapabilityPolicyForBuyerPeek(
  env: Env,
  resource: ResourceDefinition,
): Promise<PolicyOk | PolicyErr> {
  if (resource.sellType !== 'capability') return { ok: true }
  const gate = await gateCapabilityExecution(env, resource)
  if (!gate.ok) {
    return {
      ok: false,
      code: gate.code,
      httpStatus: gate.httpStatus,
      publicMessage: gate.publicMessage,
    }
  }
  const mode =
    resource.deliveryMode === 'async' ? 'async_new_job' : 'sync_execution'
  return evaluateCapabilityExecutionPolicy(env, resource, {
    mode,
    logDenial: false,
  })
}

export async function evaluateCapabilityExecutionPolicy(
  env: Env,
  resource: ResourceDefinition,
  ctx: { mode: 'async_new_job' | 'sync_execution'; logDenial?: boolean },
): Promise<PolicyOk | PolicyErr> {
  if (resource.sellType !== 'capability') return { ok: true }

  const clock = nowIso()
  await clearExpiredCapabilityPolicyPauses(env.DB, resource.slug, clock)
  const fresh = (await getResourceBySlug(env.DB, resource.slug)) ?? resource

  const logDenial = ctx.logDenial !== false
  const pause = pauseUntilMs(fresh)
  if (pause) {
    const waitSec = Math.max(1, Math.ceil((pause.untilMs - Date.now()) / 1000))
    const msg = pause.manual
      ? `This capability is temporarily paused by the seller. Try again in about ${waitSec} second(s).`
      : `This capability is temporarily paused after repeated execution failures. Try again in about ${waitSec} second(s).`
    if (logDenial) {
      await logCapabilityPolicyDenial(env, {
        slug: fresh.slug,
        code: 'CAPABILITY_TEMPORARILY_PAUSED',
        mode: ctx.mode,
        detail: {
          manual: pause.manual,
          paused_until: new Date(pause.untilMs).toISOString(),
        },
      })
    }
    return {
      ok: false,
      code: 'CAPABILITY_TEMPORARILY_PAUSED',
      httpStatus: 503,
      publicMessage: msg,
    }
  }

  const cap24 = fresh.capabilityMaxExecutionsPer24h
  if (cap24 != null && cap24 > 0) {
    const used = await countCapabilityExecutionStartsSince(
      env.DB,
      fresh.slug,
      '-24 hours',
    )
    if (used >= cap24) {
      if (logDenial) {
        await logCapabilityPolicyDenial(env, {
          slug: fresh.slug,
          code: 'CAPABILITY_EXECUTION_CAP_REACHED',
          mode: ctx.mode,
          detail: { window: '24h', cap: cap24, used },
        })
      }
      return {
        ok: false,
        code: 'CAPABILITY_EXECUTION_CAP_REACHED',
        httpStatus: 503,
        publicMessage:
          'This capability has reached its execution limit for the current 24-hour window. Try again later.',
      }
    }
  }

  const cap7 = fresh.capabilityMaxExecutionsPer7d
  if (cap7 != null && cap7 > 0) {
    const used = await countCapabilityExecutionStartsSince(
      env.DB,
      fresh.slug,
      '-7 days',
    )
    if (used >= cap7) {
      if (logDenial) {
        await logCapabilityPolicyDenial(env, {
          slug: fresh.slug,
          code: 'CAPABILITY_EXECUTION_CAP_REACHED',
          mode: ctx.mode,
          detail: { window: '7d', cap: cap7, used },
        })
      }
      return {
        ok: false,
        code: 'CAPABILITY_EXECUTION_CAP_REACHED',
        httpStatus: 503,
        publicMessage:
          'This capability has reached its execution limit for the current 7-day window. Try again later.',
      }
    }
  }

  const cooldown = fresh.capabilityCooldownSeconds
  const lastMs = lastExecutionMs(fresh)
  const now = Date.now()
  if (cooldown != null && cooldown > 0 && lastMs != null) {
    const elapsedSec = (now - lastMs) / 1000
    if (elapsedSec < cooldown) {
      const wait = Math.ceil(cooldown - elapsedSec)
      if (logDenial) {
        await logCapabilityPolicyDenial(env, {
          slug: fresh.slug,
          code: 'CAPABILITY_RATE_LIMITED',
          mode: ctx.mode,
          detail: { wait_seconds: wait },
        })
      }
      return {
        ok: false,
        code: 'CAPABILITY_RATE_LIMITED',
        httpStatus: 429,
        publicMessage: `Execution is temporarily limited. Try again in about ${wait} second(s).`,
      }
    }
  }

  if (ctx.mode === 'async_new_job') {
    const max = fresh.capabilityMaxConcurrentAsync
    if (max != null && max > 0) {
      const n = await countConcurrentAsyncJobsForSlug(env.DB, fresh.slug)
      if (n >= max) {
        if (logDenial) {
          await logCapabilityPolicyDenial(env, {
            slug: fresh.slug,
            code: 'CAPABILITY_MAX_CONCURRENCY_REACHED',
            mode: ctx.mode,
            detail: { concurrent: n, max },
          })
        }
        return {
          ok: false,
          code: 'CAPABILITY_MAX_CONCURRENCY_REACHED',
          httpStatus: 503,
          publicMessage:
            'Too many async executions are in progress for this capability. Try again shortly.',
        }
      }
    }
  }

  return { ok: true }
}

export async function touchCapabilityLastExecution(
  env: Env,
  resource: ResourceDefinition,
): Promise<void> {
  if (resource.sellType !== 'capability') return
  const t = new Date().toISOString()
  await updateCapabilityLastExecutionAt(env.DB, resource.slug, {
    lastExecutionAt: t,
    updatedAt: t,
  })
}
