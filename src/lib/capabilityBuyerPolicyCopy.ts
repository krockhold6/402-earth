import type { TFunction } from "i18next"

/**
 * Maps stable Worker capability / gate codes to buyer-facing copy (Phase 8).
 * Falls back to `fallback` when unknown.
 */
export function capabilityBuyerBlockedMessage(
  code: string | undefined,
  fallback: string | undefined,
  t: TFunction,
): string {
  const c = code?.trim() ?? ""
  switch (c) {
    case "CAPABILITY_RATE_LIMITED":
      return t("pay.capabilityPolicy.rateLimited")
    case "CAPABILITY_MAX_CONCURRENCY_REACHED":
      return t("pay.capabilityPolicy.maxConcurrency")
    case "CAPABILITY_EXECUTION_CAP_REACHED":
      return t("pay.capabilityPolicy.executionCap")
    case "CAPABILITY_TEMPORARILY_PAUSED":
      return t("pay.capabilityPolicy.temporarilyPaused")
    case "CAPABILITY_DISABLED":
      return t("pay.capabilityPolicy.disabled")
    case "CAPABILITY_ARCHIVED":
      return t("pay.capabilityPolicy.archived")
    case "CAPABILITY_ORIGIN_BLOCKED":
    case "CAPABILITY_ORIGIN_UNVERIFIED":
      return t("pay.capabilityPolicy.trustBlocked")
    case "CAPABILITY_ENDPOINT_INVALID":
      return t("pay.capabilityPolicy.endpointInvalid")
    default:
      return (fallback?.trim() || t("pay.capabilityPolicy.generic")).trim()
  }
}
