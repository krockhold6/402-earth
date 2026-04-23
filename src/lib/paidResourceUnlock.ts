/**
 * Same-tab unlock targets for x402 paid payloads (better on mobile than
 * `window.open` after async payment).
 */

export const PHYSICAL_UNLOCK_JSON_VERSION = 1

/** Matches `unlock_value TEXT` — keep client validation aligned with DB. */
export const PHYSICAL_INSTRUCTIONS_MAX_LENGTH = 8000

export function buildPhysicalUnlockJson(instructions: string): string {
  return JSON.stringify({
    kind: "physical",
    version: PHYSICAL_UNLOCK_JSON_VERSION,
    instructions,
  })
}

/**
 * Returns buyer-facing instructions when the paid JSON payload is a physical
 * fulfillment object created from the home sell flow.
 */
export function readPhysicalFulfillmentInstructions(
  type: string,
  value: unknown,
): string | null {
  if (type.toLowerCase() !== "json" || value === null || typeof value !== "object") {
    return null
  }
  const rec = value as Record<string, unknown>
  if (rec.kind !== "physical") return null
  const ins = rec.instructions
  return typeof ins === "string" && ins.trim() !== "" ? ins : null
}

function capabilityJsonKind(value: unknown): string | null {
  if (value === null || typeof value !== "object") return null
  const kind = (value as Record<string, unknown>).kind
  return typeof kind === "string" ? kind : null
}

export function resolvePaidNavigateUrl(type: string, value: unknown): string | null {
  const k = type.toLowerCase()
  if (k === "json" && capabilityJsonKind(value)?.startsWith("capability_")) {
    return null
  }
  if (k === "link" && typeof value === "string") {
    const s = value.trim()
    return /^https?:\/\//i.test(s) ? s : null
  }
  if (k === "json" && value !== null && typeof value === "object") {
    const u = (value as Record<string, unknown>).deliveryUrl
    if (typeof u === "string") {
      const s = u.trim()
      return /^https?:\/\//i.test(s) ? s : null
    }
  }
  return null
}

export function openPaidResource(type: string, value: unknown): void {
  const navUrl = resolvePaidNavigateUrl(type, value)
  if (navUrl) {
    window.location.assign(navUrl)
    return
  }
  const physical = readPhysicalFulfillmentInstructions(type, value)
  if (physical) {
    const blob = new Blob([physical], { type: "text/plain;charset=utf-8" })
    window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer")
    return
  }
  const t = type.toLowerCase()
  if (t === "text" && typeof value === "string") {
    const blob = new Blob([value], { type: "text/plain;charset=utf-8" })
    window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer")
    return
  }
  const json = JSON.stringify(value, null, 2)
  const blob = new Blob([json], { type: "application/json;charset=utf-8" })
  window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer")
}
