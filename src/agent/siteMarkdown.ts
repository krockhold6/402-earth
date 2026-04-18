/** Infer Vite-style base path from the request (GitHub project Pages lives under /repo/…). */
export function inferAppBasePath(url: URL): string {
  const host = url.hostname.toLowerCase()
  if (host.endsWith(".github.io")) {
    const segments = url.pathname.split("/").filter(Boolean)
    if (segments.length > 0) return `/${segments[0]}`
  }
  return ""
}

function joinAppUrl(origin: string, base: string, path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`
  if (!base) return `${origin}${p}`
  return `${origin}${base}${p}`
}

/** Markdown for `Accept: text/markdown` (Cloudflare Pages middleware). */
export function siteMarkdownForPath(path: string, url: URL): string | undefined {
  const origin = url.origin
  const base = inferAppBasePath(url)
  const u = (p: string) => joinAppUrl(origin, base, p)

  switch (path) {
    case "/":
      return `# 402.earth

HTTP micropayments for the web using **x402** on Base USDC.

- **Buy / sell**: create a resource, share a pay link, and deliver content after payment.
- **API docs**: [${u("/api")}](${u("/api")})
- **Machine API**: \`https://api.402.earth\` — RFC 9727 catalog at \`/.well-known/api-catalog\` and OpenAPI at [${u("/openapi.json")}](${u("/openapi.json")}).

## More

- [How it works](${u("/how-it-works")})
- [Demo](${u("/demo")})
`
    case "/buy":
      return `# Buy

Configure what you sell and share pay links.

[Open buy](${u("/buy")})
`
    case "/api":
      return `# API documentation

Interactive docs render in the SPA. OpenAPI: [${u("/openapi.json")}](${u("/openapi.json")}) and worker copy at \`https://api.402.earth/openapi.json\`.

[Open API page](${u("/api")})
`
    case "/how-it-works":
      return `# How it works

[Open in app](${u("/how-it-works")})
`
    case "/demo":
      return `# Demo

[Open in app](${u("/demo")})
`
    case "/terms":
      return `# Terms

[Open in app](${u("/terms")})
`
    case "/privacy":
      return `# Privacy

[Open in app](${u("/privacy")})
`
    default:
      return undefined
  }
}
