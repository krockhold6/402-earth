/**
 * Parse USDC decimal string to 6-decimal minor units (matches worker `parseUsdcMinorUnits`).
 */

export function parseUsdcMinorUnits(amountStr: string): bigint | null {
  const t = amountStr.trim()
  if (!t) return null
  const m = /^(\d+)(?:\.(\d{0,18}))?$/.exec(t)
  if (!m) return null
  const fracRaw = m[2] ?? ''
  if (fracRaw.length > 6) return null
  const frac = fracRaw.padEnd(6, '0')
  try {
    return BigInt(m[1]) * 1_000_000n + BigInt(frac === '' ? '0' : frac)
  } catch {
    return null
  }
}
