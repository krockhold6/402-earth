function randomSuffix(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 24)
}

/** Primary key for `payment_attempts`. */
export function createAttemptId(): string {
  return `pa_${randomSuffix()}`
}

/** Primary key for `payment_events`. */
export function createEventId(): string {
  return `pe_${randomSuffix()}`
}
