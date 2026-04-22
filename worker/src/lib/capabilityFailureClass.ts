/**
 * Classifies async capability failures for retry vs terminal decisions.
 * Transport / transient: retry when attempts remain.
 * Trust / validation / client upstream errors: do not retry.
 */

export type FailureClass =
  | 'transport'
  | 'trust'
  | 'validation'
  | 'upstream_client'
  | 'permanent'

export function classifyFetchFailure(input: {
  gateCode?: string
  lastError?: string | null
  httpStatus: number
}): { failureClass: FailureClass; retryable: boolean } {
  if (input.gateCode) {
    return { failureClass: 'trust', retryable: false }
  }
  const err = (input.lastError ?? '').toLowerCase()
  if (
    err.includes('attempt_not_paid') ||
    err.includes('resource_missing') ||
    err.includes('missing endpoint')
  ) {
    return { failureClass: 'validation', retryable: false }
  }

  if (input.httpStatus === 0) {
    return { failureClass: 'transport', retryable: true }
  }

  if (input.httpStatus >= 500 || input.httpStatus === 408 || input.httpStatus === 429) {
    return { failureClass: 'transport', retryable: true }
  }

  if (input.httpStatus >= 400 && input.httpStatus < 500) {
    return { failureClass: 'upstream_client', retryable: false }
  }

  return { failureClass: 'transport', retryable: true }
}

/** Exponential backoff delays (ms) after attempt 1, 2, … before next retry. */
export function retryDelayMsForAttempt(attemptNumberAfterFailure: number): number {
  const tiers = [30_000, 120_000, 300_000, 600_000]
  const i = Math.min(Math.max(attemptNumberAfterFailure - 1, 0), tiers.length - 1)
  return tiers[i]!
}
