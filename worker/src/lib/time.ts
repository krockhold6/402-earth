export function nowIso(): string {
  return new Date().toISOString()
}

export function addSecondsIso(fromIso: string, seconds: number): string {
  const ms = Date.parse(fromIso)
  const base = Number.isFinite(ms) ? ms : Date.now()
  return new Date(base + seconds * 1000).toISOString()
}
