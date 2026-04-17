/**
 * Lightweight x402 wire helpers for dev/agent tooling (mirrors worker semantics).
 */

/** Find a header value case-insensitively. */
export function getHeader(headers: Headers, name: string): string | null {
  const want = name.toLowerCase()
  for (const [k, v] of headers) {
    if (k.toLowerCase() === want) return v
  }
  return null
}

/**
 * Decode PAYMENT-REQUIRED (base64(JSON) in production; also accepts legacy plain JSON).
 * Returns `null` when the value cannot be decoded to a JSON object.
 */
export function decodePaymentRequiredHeader(headerValue: string): Record<string, unknown> | null {
  const t = headerValue.trim()
  if (!t) return null
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      const v = JSON.parse(t) as unknown
      if (Array.isArray(v)) {
        const first = v[0]
        if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
          return first as Record<string, unknown>
        }
        return null
      }
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        return v as Record<string, unknown>
      }
    } catch {
      return null
    }
    return null
  }
  try {
    const text = Buffer.from(t, 'base64').toString('utf8')
    const v = JSON.parse(text) as unknown
    return v !== null && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

const RETRY_HEADER_NAMES = [
  'content-type',
  'payment-required',
  'payment-signature',
  'access-control-expose-headers',
  'cache-control',
]

/** Pick a small set of response headers useful for protocol inspection. */
export function pickImportantResponseHeaders(res: Response): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of RETRY_HEADER_NAMES) {
    const v = getHeader(res.headers, name)
    if (v) out[name] = v
  }
  return out
}
