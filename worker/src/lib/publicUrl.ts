import type { Env } from '../types/env'

/** Public API base URL (for resource URLs, x402 links). */
export function apiPublicUrl(env: Env, req: Request): string {
  if (env.API_PUBLIC_URL) return env.API_PUBLIC_URL.replace(/\/$/, '')
  const host = req.headers.get('host')
  if (host) {
    const proto = host.includes('localhost') ? 'http' : 'https'
    return `${proto}://${host}`
  }
  return 'https://api.402.earth'
}
