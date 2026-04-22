/**
 * Same-tab unlock targets for x402 paid payloads (better on mobile than
 * `window.open` after async payment).
 */

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
