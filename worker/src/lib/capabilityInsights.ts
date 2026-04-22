import type { CapabilityAnalyticsRow } from '../db/capabilityAnalytics'
import type { ResourceDefinition } from '../types/resource'

export type InsightLevel = 'ok' | 'warning' | 'critical'

export type CapabilityInsight = {
  level: InsightLevel
  code: string
  message: string
}

/**
 * Rule-based seller-facing insights (no ML).
 */
export function buildCapabilityInsights(input: {
  resource: ResourceDefinition
  analytics: CapabilityAnalyticsRow
  recentFailureClasses: (string | null)[]
}): CapabilityInsight[] {
  const out: CapabilityInsight[] = []
  const lc = input.resource.capabilityLifecycle ?? 'active'
  if (lc === 'archived') {
    out.push({
      level: 'warning',
      code: 'lifecycle_archived',
      message:
        'This capability is archived. New executions are blocked; history remains visible.',
    })
  } else if (lc === 'disabled') {
    out.push({
      level: 'warning',
      code: 'lifecycle_disabled',
      message:
        'This capability is disabled. Execution is blocked until you re-enable it.',
    })
  }

  const trust = input.resource.capabilityOriginTrust
  if (trust === 'blocked') {
    out.push({
      level: 'critical',
      code: 'trust_blocked',
      message:
        'Origin trust is blocking execution. Update the endpoint or allowlist the host.',
    })
  } else if (trust === 'unverified') {
    out.push({
      level: 'warning',
      code: 'trust_unverified',
      message:
        'The execution origin is not verified. Strict trust mode may deny runs — allowlist the host if needed.',
    })
  }

  const a = input.analytics
  const terminal = a.completed_count + a.failed_count
  if (terminal >= 5 && a.failed_count > 0) {
    const failRate = a.failed_count / terminal
    if (failRate >= 0.35) {
      out.push({
        level: 'warning',
        code: 'failure_rate_elevated',
        message: `Roughly ${Math.round(failRate * 100)}% of recent terminal jobs failed. Check upstream health and trust settings.`,
      })
    }
  }

  if (a.retry_events >= 3 && terminal >= 3) {
    out.push({
      level: 'warning',
      code: 'retries_elevated',
      message:
        'Retry volume is elevated — upstream may be flaky or timing out.',
    })
  }

  const completed = a.completed_count
  if (completed > 0) {
    const lost =
      completed - (a.full_result_still_available ?? 0)
    if (lost > completed * 0.25 && completed >= 4) {
      out.push({
        level: 'warning',
        code: 'results_expiring_or_purged',
        message:
          'Many completed jobs no longer have a stored full result (expired retention or preview-only). Buyers may only see previews.',
      })
    }
  }

  const hasHttpFailureClass = input.recentFailureClasses.some(
    (fc) => fc === 'http',
  )
  if (hasHttpFailureClass && input.analytics.failed_count >= 2) {
    out.push({
      level: 'warning',
      code: 'upstream_http_failures',
      message:
        'Some recent failures were classified as HTTP/upstream issues — verify status codes and timeouts.',
    })
  }

  if (out.length === 0) {
    out.push({
      level: 'ok',
      code: 'healthy',
      message:
        'No major issues detected from recent jobs and configuration. Monitor failures if traffic grows.',
    })
  }

  return out
}
