/**
 * URL for a file from `public/` (served at the site root). Vite does not rewrite
 * string literals in TS/JS — only `index.html` and bundled imports — so hardcoded
 * `/img/...` breaks whenever `base` is not `/` (e.g. GitHub project Pages).
 */
export function publicUrl(relativeToPublicRoot: string): string {
  const base = import.meta.env.BASE_URL ?? "/"
  const trimmed = relativeToPublicRoot.replace(/^\/+/, "")
  const prefix = base.endsWith("/") ? base : `${base}/`
  return `${prefix}${trimmed}`
}
