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
 * Prefix for same-origin SPA paths (pay links, QR codes). Matches React Router basename
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
 * Absolute URL to the SPA pay page (for QR, share sheet, etc.).
 * When `attemptId` is set, the payer opens a session tied to that worker attempt.
 */
export function absolutePayPageUrl(
  slug: string,
  attemptId?: string | null,
): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : ""
  const base = appBasePath()
  const path = `${base}/pay/${encodeURIComponent(slug)}`
  const qs =
    attemptId != null && attemptId !== ""
      ? `?attemptId=${encodeURIComponent(attemptId)}`
      : ""
  return `${origin}${path}${qs}`
}
