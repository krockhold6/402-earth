/**
 * Client-side slug in the same shape as the Worker’s `createResourceSlug`
 * (`pay-` + 12 hex chars). Safe for optional `slug` on `POST /api/resource`.
 */
export function suggestResourceSlug(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("")
  return `pay-${hex}`
}
