/** Extract async job id from x402 paid JSON payload (`capability_async`). */
export function readCapabilityAsyncJobId(value: unknown): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  const id = (value as Record<string, unknown>).async_job_id
  return typeof id === "string" && id.trim() !== "" ? id.trim() : null
}
