/**
 * x402-style PAYMENT-REQUIRED / PAYMENT-SIGNATURE helpers (wire format).
 */

const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/

function utf8ToBinaryString(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) {
    bin += String.fromCharCode(b)
  }
  return bin
}

function binaryStringToUtf8(bin: string): string {
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i) & 0xff
  }
  return new TextDecoder('utf-8').decode(bytes)
}

/** Base64 (standard) JSON for PAYMENT-REQUIRED header value. */
export function buildPaymentRequiredHeaderValue(
  requirements: Record<string, unknown>,
): string {
  const json = JSON.stringify(requirements)
  return btoa(utf8ToBinaryString(json))
}

/**
 * Decode PAYMENT-REQUIRED header (debug / clients).
 * Canonical wire format: base64(utf8(JSON object)) — see `buildPaymentRequiredHeaderValue`.
 * Also accepts legacy plain JSON object or array (first element) for older responses.
 */
export function decodePaymentRequiredHeader(
  headerValue: string,
): Record<string, unknown> | null {
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
    const bin = atob(t)
    const text = binaryStringToUtf8(bin)
    const v = JSON.parse(text) as unknown
    return v !== null && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export function readPaymentSignatureHeader(req: Request): string | null {
  const raw =
    req.headers.get('payment-signature') ??
    req.headers.get('x-payment-signature')
  const t = raw?.trim()
  return t ? t : null
}

export type ParsedPaymentSignature =
  | { ok: true; txHash: string | null; paymentSignature: string }
  | { ok: false; message: string }

function pickTxHash(o: Record<string, unknown>): string | null {
  const keys = ['txHash', 'transactionHash', 'hash'] as const
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'string' && TX_HASH_RE.test(v.trim())) {
      return v.trim()
    }
  }
  return null
}

function pickPaymentSignature(o: Record<string, unknown>): string | null {
  const v = o.paymentSignature
  if (typeof v === 'string' && v.trim()) return v.trim()
  return null
}

/**
 * Parse PAYMENT-SIGNATURE: raw tx hash, JSON object, or base64-wrapped JSON.
 * `paymentSignature` is the string passed to facilitator mock hashing when no separate value exists.
 */
export function parsePaymentSignatureHeaderValue(raw: string): ParsedPaymentSignature {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false, message: 'PAYMENT-SIGNATURE is empty' }
  }

  if (TX_HASH_RE.test(trimmed)) {
    return {
      ok: true,
      txHash: trimmed,
      paymentSignature: trimmed,
    }
  }

  const tryObject = (o: unknown): ParsedPaymentSignature | null => {
    if (o === null || typeof o !== 'object' || Array.isArray(o)) return null
    const rec = o as Record<string, unknown>
    const tx = pickTxHash(rec)
    const ps = pickPaymentSignature(rec) ?? (tx ?? JSON.stringify(rec))
    return { ok: true, txHash: tx, paymentSignature: ps }
  }

  try {
    const direct = JSON.parse(trimmed) as unknown
    if (typeof direct === 'string' && TX_HASH_RE.test(direct.trim())) {
      const h = direct.trim()
      return { ok: true, txHash: h, paymentSignature: h }
    }
    const d = tryObject(direct)
    if (d) return d
  } catch {
    // fall through
  }

  try {
    const bin = atob(trimmed.replace(/\s/g, ''))
    const text = binaryStringToUtf8(bin)
    const parsed = JSON.parse(text) as unknown
    const d = tryObject(parsed)
    if (d) return d
  } catch {
    // fall through
  }

  return {
    ok: false,
    message:
      'PAYMENT-SIGNATURE must be a Base USDC tx hash (0x + 64 hex) or JSON / base64(JSON) with a txHash field',
  }
}
