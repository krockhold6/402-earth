import type { Env } from '../types/env'

export function siteBaseUrl(env: Env): string {
  const s = env.SITE_URL?.trim()
  if (s) return s.replace(/\/$/, '')
  return 'https://402.earth'
}

/** Canonical HTTPS URL for the buyer-facing SPA unlock page (`/unlock/:slug`). */
export function buyerUnlockPageUrl(env: Env, slug: string): string {
  return `${siteBaseUrl(env)}/unlock/${encodeURIComponent(slug)}`
}
