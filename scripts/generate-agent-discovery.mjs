/**
 * Writes agent-discovery and SEO artifacts into `public/` and worker JSON
 * imports. Run via `npm run generate:agent-discovery` (also `prebuild` / `predev`).
 *
 * Env:
 * - SITE_ORIGIN — canonical site (default https://402.earth)
 * - API_PUBLIC_ORIGIN — public API host (default https://api.402.earth)
 * - VITE_BASE_PATH / VITE_PUBLIC_BASE — same as Vite base (default /)
 */
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")

const SITE_ORIGIN = (process.env.SITE_ORIGIN ?? "https://402.earth").replace(
  /\/$/,
  "",
)
const API_ORIGIN = (
  process.env.API_PUBLIC_ORIGIN ?? "https://api.402.earth"
).replace(/\/$/, "")

function normalizeViteBase(raw) {
  const t = String(raw ?? "/").trim()
  if (t === "" || t === "/") return ""
  if (t === "." || t === "./") return ""
  const withSlash = t.endsWith("/") ? t : `${t}/`
  return withSlash.startsWith("/")
    ? withSlash.replace(/\/$/, "")
    : `/${withSlash.replace(/\/$/, "")}`
}

const basePath = normalizeViteBase(
  process.env.VITE_BASE_PATH ?? process.env.VITE_PUBLIC_BASE ?? "/",
)

/** Absolute URL for an app path (path starts with `/`). */
function canonicalUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`
  if (!basePath) return `${SITE_ORIGIN}${p}`
  const prefix = basePath.startsWith("/") ? basePath : `/${basePath}`
  return `${SITE_ORIGIN}${prefix}${p}`
}

const staticPaths = [
  "/",
  "/buy",
  "/api",
  "/how-it-works",
  "/demo",
  "/terms",
  "/privacy",
]

/** Optional fixed date (YYYY-MM-DD) to avoid noisy sitemap churn in git. */
const lastmod =
  process.env.SITEMAP_LASTMOD?.trim() ||
  new Date().toISOString().slice(0, 10)

function buildSitemapXml() {
  const urls = staticPaths
    .map(
      (path) => `  <url>
    <loc>${canonicalUrl(path)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
  </url>`,
    )
    .join("\n")
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
}

function buildRobotsTxt() {
  return `User-agent: *
Allow: /

Sitemap: ${canonicalUrl("/sitemap.xml")}
`
}

function buildOpenApi() {
  return {
    openapi: "3.1.0",
    info: {
      title: "402-earth payment API",
      version: "1.0.0",
      description:
        "HTTP APIs for x402 payment attempts, paid resource delivery, and resource configuration. Browser flows use https://402.earth; machine clients call this host.",
    },
    servers: [{ url: API_ORIGIN }],
    paths: {
      "/api/resource": {
        post: {
          summary: "Create or update a sellable resource",
          operationId: "postResource",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["label", "amount", "receiverAddress"],
                  properties: {
                    label: { type: "string" },
                    amount: { type: "string" },
                    receiverAddress: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
                    slug: { type: "string" },
                    unlockType: { type: "string", enum: ["json", "text", "link"] },
                    unlockValue: {},
                    deliveryMode: { type: "string", enum: ["direct", "protected"] },
                    protectedTtlSeconds: { type: "integer", minimum: 60, maximum: 604800 },
                    oneTimeUnlock: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Created or updated resource" },
            "400": { description: "Validation error" },
          },
        },
      },
      "/api/resource/{slug}": {
        get: {
          summary: "Fetch public resource metadata",
          operationId: "getResource",
          parameters: [
            {
              name: "slug",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Resource" },
            "404": { description: "Not found" },
          },
        },
      },
      "/api/payment-attempt": {
        post: {
          summary: "Create a payment attempt for a resource",
          operationId: "postPaymentAttempt",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["slug", "clientType"],
                  properties: {
                    slug: { type: "string" },
                    clientType: {
                      type: "string",
                      enum: ["browser", "agent", "api"],
                    },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Attempt created" } },
        },
      },
      "/api/payment-attempt/{id}": {
        get: {
          summary: "Get payment attempt by id",
          operationId: "getPaymentAttempt",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { "200": { description: "Attempt" } },
        },
      },
      "/x402/pay/{slug}": {
        get: {
          summary: "Paywall / paid payload delivery for x402",
          operationId: "x402Pay",
          parameters: [
            {
              name: "slug",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "attemptId",
              in: "query",
              schema: { type: "string" },
            },
          ],
          responses: { "200": { description: "JSON payment or resource body" } },
        },
      },
      "/x402/verify": {
        post: {
          summary: "Verify on-chain USDC payment for an attempt",
          operationId: "x402Verify",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["attemptId", "slug"],
                  properties: {
                    attemptId: { type: "string" },
                    slug: { type: "string" },
                    txHash: { type: "string" },
                    paymentSignature: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Verification result" } },
        },
      },
      "/health": {
        get: {
          summary: "Liveness / health",
          operationId: "health",
          responses: { "200": { description: "OK" } },
        },
      },
      "/unlock/{token}": {
        get: {
          summary: "Redeem a short-lived protected delivery unlock token",
          operationId: "getUnlock",
          parameters: [
            {
              name: "token",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "302": { description: "Redirect to the seller final URL" },
            "404": { description: "Unknown token" },
            "410": { description: "Expired or exhausted token" },
          },
        },
      },
    },
  }
}

function buildApiCatalogLinkset() {
  return {
    linkset: [
      {
        anchor: `${API_ORIGIN}/`,
        "service-desc": [
          {
            href: `${SITE_ORIGIN}/openapi.json`,
            type: "application/json",
          },
        ],
        "service-doc": [
          {
            href: canonicalUrl("/api"),
            type: "text/html",
          },
        ],
        status: [
          {
            href: `${API_ORIGIN}/health`,
            type: "application/json",
          },
        ],
      },
    ],
  }
}

function sha256HexOfFile(absPath) {
  const buf = readFileSync(absPath)
  return `sha256:${createHash("sha256").update(buf).digest("hex")}`
}

function main() {
  const skillPath = join(
    root,
    "public/.well-known/agent-skills/402-earth.skill.md",
  )
  const skillDigest = sha256HexOfFile(skillPath)

  const openApi = buildOpenApi()
  const linkset = buildApiCatalogLinkset()

  const skillsIndex = {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: [
      {
        name: "402-earth-x402",
        type: "skill-md",
        description:
          "Use the 402.earth site and x402 payment APIs: resources, payment attempts, and verification.",
        url: `${SITE_ORIGIN}/.well-known/agent-skills/402-earth.skill.md`,
        digest: skillDigest,
      },
    ],
  }

  mkdirSync(join(root, "public/.well-known/agent-skills"), { recursive: true })
  mkdirSync(join(root, "worker/src"), { recursive: true })

  writeFileSync(join(root, "public/sitemap.xml"), buildSitemapXml(), "utf8")
  writeFileSync(join(root, "public/robots.txt"), buildRobotsTxt(), "utf8")
  writeFileSync(
    join(root, "public/openapi.json"),
    `${JSON.stringify(openApi, null, 2)}\n`,
    "utf8",
  )

  const linksetJson = `${JSON.stringify(linkset, null, 2)}\n`
  writeFileSync(join(root, "public/.well-known/api-catalog"), linksetJson, "utf8")
  writeFileSync(
    join(root, "worker/src/well-known-api-catalog.generated.json"),
    linksetJson,
    "utf8",
  )

  writeFileSync(
    join(root, "public/.well-known/agent-skills/index.json"),
    `${JSON.stringify(skillsIndex, null, 2)}\n`,
    "utf8",
  )

  writeFileSync(
    join(root, "worker/src/openapi.generated.json"),
    `${JSON.stringify(openApi, null, 2)}\n`,
    "utf8",
  )

  console.log("generate-agent-discovery: wrote public + worker discovery files")
}

main()
