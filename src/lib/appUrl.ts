/**
 * First URL path segment for GitHub **project** Pages (`<user>.github.io/<repo>/…`).
 * Empty on apex hosts and during SSR. Keeps one `./` Vite build working on both.
 */
export function githubProjectPathPrefix(): string {
  if (typeof window === "undefined") return ""
  const { host, pathname } = window.location
  if (!host.toLowerCase().endsWith(".github.io")) return ""
  const segments = pathname.split("/").filter(Boolean)
  if (segments.length < 1) return ""
  return `/${segments[0]}`
}

/**
 * Prefix for same-origin SPA paths (unlock links, QR codes). Matches React Router basename
 * when using Vite `base: './'`.
 */
export function appBasePath(): string {
  const raw = import.meta.env.BASE_URL ?? "/"
  if (raw !== "/" && raw !== "" && raw !== "./" && raw !== ".") {
    return raw.replace(/\/$/, "")
  }
  return githubProjectPathPrefix()
}

/**
 * Same-origin path to the buyer unlock page (`/unlock/:slug`).
 * Optional `attemptId` ties the tab to a worker payment attempt.
 */
export function unlockPagePath(
  slug: string,
  attemptId?: string | null,
): string {
  const base = appBasePath()
  const prefix = `${base}/unlock/${encodeURIComponent(slug)}`
  const qs =
    attemptId != null && attemptId !== ""
      ? `?attemptId=${encodeURIComponent(attemptId)}`
      : ""
  return `${prefix}${qs}`
}

/**
 * Absolute URL to the buyer unlock page (QR, share sheet, deep links).
 * Uses the current page origin so QR/copy always match the SPA the creator is on.
 */
export function absoluteUnlockPageUrl(
  slug: string,
  attemptId?: string | null,
): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : ""
  return `${origin}${unlockPagePath(slug, attemptId)}`
}

/** @deprecated Use `unlockPagePath` — `/pay/:slug` redirects to `/unlock/:slug`. */
export function absolutePayPageUrl(
  slug: string,
  attemptId?: string | null,
): string {
  return absoluteUnlockPageUrl(slug, attemptId)
}
