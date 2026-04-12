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

/** URL-safe slug for `resource_definitions` when the client omits `slug`. */
export function createResourceSlug(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
  return `pay-${hex}`
}
