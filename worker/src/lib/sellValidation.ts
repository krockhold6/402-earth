const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

export function parseSellType(
  raw: unknown,
): 'resource' | 'capability' | null {
  if (raw === undefined || raw === null) return 'resource'
  if (typeof raw !== 'string') return null
  const s = raw.trim().toLowerCase()
  if (s === '' || s === 'resource') return 'resource'
  if (s === 'capability') return 'capability'
  return null
}

export function isValidHttpMethod(method: string): boolean {
  return HTTP_METHODS.has(method.trim().toUpperCase())
}

/**
 * Capability endpoints must be absolute https URLs (avoids SSRF ambiguity with relative paths).
 */
export function parseHttpsEndpoint(raw: unknown): { ok: true; url: string } | { ok: false; message: string } {
  if (typeof raw !== 'string') {
    return { ok: false, message: 'endpoint must be a string' }
  }
  const s = raw.trim()
  if (!s) {
    return { ok: false, message: 'endpoint is required' }
  }
  try {
    const u = new URL(s)
    if (u.protocol !== 'https:') {
      return { ok: false, message: 'endpoint must use https' }
    }
    return { ok: true, url: u.toString() }
  } catch {
    return { ok: false, message: 'endpoint must be a valid absolute https URL' }
  }
}

export function parseNonEmptyString(
  raw: unknown,
  field: string,
): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, message: `${field} is required` }
  }
  return { ok: true, value: raw.trim() }
}

export function parseReceiptMode(
  raw: unknown,
): { ok: true; value: 'standard' | 'detailed' } | { ok: false; message: string } {
  if (typeof raw !== 'string') {
    return { ok: false, message: 'receipt_mode must be standard or detailed' }
  }
  const s = raw.trim().toLowerCase()
  if (s === 'standard' || s === 'detailed') {
    return { ok: true, value: s }
  }
  return { ok: false, message: 'receipt_mode must be standard or detailed' }
}

export function parseCapabilityExposure(
  raw: unknown,
): { ok: true; value: 'api' | 'mcp' | 'both' } | { ok: false; message: string } {
  if (raw == null || String(raw).trim() === '') {
    return { ok: true, value: 'api' }
  }
  const s = String(raw).trim().toLowerCase()
  if (s === 'api' || s === 'mcp' || s === 'both') {
    return { ok: true, value: s }
  }
  return { ok: false, message: 'capability_exposure must be api, mcp, or both' }
}

export function parseCapabilityMcpType(
  raw: unknown,
): { ok: true; value: 'tool' | 'resource' | 'prompt' | null } | { ok: false; message: string } {
  if (raw == null || String(raw).trim() === '') {
    return { ok: true, value: null }
  }
  const s = String(raw).trim().toLowerCase()
  if (s === 'tool' || s === 'resource' || s === 'prompt') {
    return { ok: true, value: s }
  }
  return { ok: false, message: 'mcp_type must be tool, resource, or prompt' }
}
