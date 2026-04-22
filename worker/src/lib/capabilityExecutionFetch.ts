import type { ResourceDefinition } from '../types/resource'

export type CapabilityFetchResult = {
  ok: boolean
  httpStatus: number
  bodyText: string
  error?: string
}

/** Truncate for storage / previews (honest size cap). */
export const RESULT_PREVIEW_MAX = 4096

export function truncateResultPreview(text: string): string {
  if (text.length <= RESULT_PREVIEW_MAX) return text
  return text.slice(0, RESULT_PREVIEW_MAX) + '…'
}

export async function fetchCapabilityEndpoint(
  resource: ResourceDefinition,
): Promise<CapabilityFetchResult> {
  const url = resource.endpoint
  const method = (resource.httpMethod ?? 'GET').toUpperCase()
  if (!url) {
    return { ok: false, httpStatus: 0, bodyText: '', error: 'missing endpoint' }
  }
  if (method !== 'GET' && method !== 'HEAD') {
    const ifmt = resource.inputFormat?.toLowerCase() ?? 'json'
    const headers: Record<string, string> = {
      'Content-Type':
        ifmt === 'json' ? 'application/json' : 'text/plain;charset=utf-8',
    }
    const body = ifmt === 'json' ? '{}' : ''
    try {
      const res = await fetch(url, { method, headers, body, redirect: 'follow' })
      const bodyText = await res.text()
      return { ok: res.ok, httpStatus: res.status, bodyText }
    } catch (e) {
      return {
        ok: false,
        httpStatus: 0,
        bodyText: '',
        error: e instanceof Error ? e.message : 'fetch failed',
      }
    }
  }
  try {
    const res = await fetch(url, { method, redirect: 'follow' })
    const bodyText = await res.text()
    return { ok: res.ok, httpStatus: res.status, bodyText }
  } catch (e) {
    return {
      ok: false,
      httpStatus: 0,
      bodyText: '',
      error: e instanceof Error ? e.message : 'fetch failed',
    }
  }
}
