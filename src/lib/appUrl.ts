/**
 * Vite `base` without trailing slash, or "" when the app is served from the site root.
 * QR codes and shared links must include this so deep links work on GitHub Pages / subpaths.
 */
export function appBasePath(): string {
  const raw = import.meta.env.BASE_URL ?? "/"
  if (raw === "/" || raw === "") return ""
  return raw.replace(/\/$/, "")
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
