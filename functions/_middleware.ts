/**
 * Cloudflare Pages Functions middleware (ignored by GitHub Pages static deploy).
 * Serves markdown for `Accept: text/markdown` on key SPA routes.
 */
import { siteMarkdownForPath } from "../src/agent/siteMarkdown"

function normalizePath(pathname: string): string {
  if (pathname === "" || pathname === "/") return "/"
  if (pathname.endsWith("/") && pathname.length > 1) {
    return pathname.replace(/\/+$/, "") || "/"
  }
  return pathname
}

function acceptsMarkdown(accept: string | null): boolean {
  if (!accept) return false
  const parts = accept.split(",").map((p) => p.trim().split(";")[0]?.trim())
  return parts.some((p) => p === "text/markdown" || p === "text/x-markdown")
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

export const onRequest = async (context: {
  request: Request
  next: () => Promise<Response>
}): Promise<Response> => {
  const accept = context.request.headers.get("Accept")
  if (!acceptsMarkdown(accept)) {
    return context.next()
  }

  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return context.next()
  }

  const url = new URL(context.request.url)
  const path = normalizePath(url.pathname)
  const md = siteMarkdownForPath(path, url)
  if (md === undefined) {
    return context.next()
  }

  const tokens = estimateTokens(md)
  const headers = new Headers({
    "Content-Type": "text/markdown; charset=utf-8",
    "x-markdown-tokens": String(tokens),
    Vary: "Accept",
  })

  if (context.request.method === "HEAD") {
    return new Response(null, { status: 200, headers })
  }

  return new Response(md, { status: 200, headers })
}
