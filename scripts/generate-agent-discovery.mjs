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
                    protectedTtlSeconds: {
                      type: "integer",
                      minimum: 0,
                      maximum: 604800,
                      description:
                        "Unlock token TTL in seconds; 0 means no practical expiry (tokens use a long horizon).",
                    },
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
            "200": {
              description:
                "Resource; capabilities may include capability_buyer_execution (Phase 8 policy peek). Buyer UI: async runs also have /unlock/{slug}/capability/{jobId} (Phase 9).",
            },
            "404": { description: "Not found" },
          },
        },
      },
      "/api/payment-attempt": {
        post: {
          summary:
            "Create a payment attempt for a resource or capability (capabilities: Phase 8 policy/trust precheck may return 403/429/503 with stable code)",
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
          responses: {
            "200": { description: "Attempt created" },
            "403": { description: "Capability gated (e.g. trust, lifecycle)" },
            "409": { description: "Capability disabled/archived" },
            "429": { description: "Policy: rate limited (cooldown)" },
            "503": { description: "Policy: concurrency, caps, or temporary pause" },
          },
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
          responses: {
            "200": {
              description:
                "JSON payment or resource body; attemptId anchors commercial/receipt truth. Phase 10 capability_buyer_outcome; Phase 10.5: async jobs also progress via queue (see platform docs).",
            },
          },
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
      "/api/capability/seller/challenge": {
        post: {
          summary: "Start wallet-signed seller session (challenge message)",
          operationId: "postCapabilitySellerChallenge",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["wallet"],
                  properties: { wallet: { type: "string" } },
                },
              },
            },
          },
          responses: { "200": { description: "challenge_id, message, expires_at" } },
        },
      },
      "/api/capability/seller/auth": {
        post: {
          summary: "Exchange signed challenge for seller JWT",
          operationId: "postCapabilitySellerAuth",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["wallet", "challenge_id", "signature"],
                  properties: {
                    wallet: { type: "string" },
                    challenge_id: { type: "string" },
                    signature: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "token, wallet, expires_in_seconds" },
            "401": { description: "Invalid signature" },
          },
        },
      },
      "/api/capability/seller/allowlist": {
        get: {
          summary: "List allowlisted hosts for own receiver (Bearer seller JWT)",
          operationId: "getSellerCapabilityAllowlist",
          parameters: [
            {
              name: "receiverAddress",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "entries" },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          summary: "Add allowlisted host (seller-scoped)",
          operationId: "postSellerCapabilityAllowlist",
          responses: {
            "200": { description: "Created" },
            "409": { description: "Duplicate" },
          },
        },
        delete: {
          summary: "Remove allowlisted host (seller-scoped)",
          operationId: "deleteSellerCapabilityAllowlist",
          responses: {
            "200": { description: "Removed" },
            "404": { description: "Not found" },
          },
        },
      },
      "/api/capability/seller/analytics/summary": {
        get: {
          summary:
            "Per-capability health metrics for all capabilities owned by the signed wallet (seller JWT)",
          operationId: "getSellerCapabilityAnalyticsSummary",
          responses: {
            "200": { description: "capabilities[] with analytics aggregates" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/capability/seller/capabilities": {
        get: {
          summary:
            "Phase 7 — seller capability index with operational summaries and cross-capability operations_summary (seller JWT)",
          operationId: "getSellerCapabilitiesIndex",
          responses: {
            "200": {
              description:
                "operations_summary (Phase 8: policy_blocked counts, auto_pause signals, quick_filters), capabilities[] (health_tier, expanded policy_summary, notification_summary, analytics-derived fields)",
            },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/capability/seller/capability/{slug}": {
        get: {
          summary:
            "Capability detail: analytics, insights, history, notifications, allowlist (seller JWT)",
          operationId: "getSellerCapabilityDetail",
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description:
                "resource, capability_descriptor (Phase 10.5 internal normalized shape), policy_snapshot, analytics, insights, recent_jobs (execution rows keyed by job id; attempt_id inside row is payment anchor), allowlist_entries, recent_notifications",
            },
            "403": { description: "Not owner" },
          },
        },
        patch: {
          summary:
            "Update capability fields, lifecycle, execution policy (cooldown, concurrency, 24h/7d caps, auto-pause, manual pause-until, clear_capability_execution_pause), notification channels (seller JWT)",
          operationId: "patchSellerCapability",
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "Updated resource" } },
        },
      },
      "/api/capability/seller/capability/{slug}/audit": {
        get: {
          summary: "Audit ledger events for a capability (seller JWT)",
          operationId: "getSellerCapabilityAudit",
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "events" } },
        },
      },
      "/api/capability/seller/capability/{slug}/analytics": {
        get: {
          summary:
            "Time-windowed async job analytics, prior-window comparison, notification delivery stats (seller JWT)",
          operationId: "getSellerCapabilityWindowAnalytics",
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
            {
              name: "window",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["24h", "7d", "30d"] },
            },
          ],
          responses: {
            "200": {
              description:
                "current, prior_window, trends, notification_delivery; windowed 24h/7d/30d",
            },
          },
        },
      },
      "/api/capability/seller/capability/{slug}/notifications": {
        get: {
          summary:
            "Recent notification delivery rows with optional filters + health summary (seller JWT)",
          operationId: "getSellerCapabilityNotifications",
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100 },
            },
            {
              name: "status",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: ["pending", "delivered", "failed"],
              },
            },
            {
              name: "channel",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["email", "webhook"] },
            },
          ],
          responses: {
            "200": {
              description:
                "deliveries[], filters_echo, summary (delivery_health, latest_failed, latest_delivered)",
            },
          },
        },
      },
      "/api/capability/seller/capability/{slug}/notifications/test": {
        post: {
          summary:
            "Send notification_test to configured channels; records deliveries (seller JWT)",
          operationId: "postSellerCapabilityNotificationTest",
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "ok, results[] per channel" },
            "400": { description: "No channel configured" },
          },
        },
      },
      "/api/capability/seller/capability/{slug}/notifications/{deliveryId}/retry": {
        post: {
          summary:
            "Retry a failed delivery when still honest (async_job_* or notification_test) (seller JWT)",
          operationId: "postSellerCapabilityNotificationRetry",
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
            { name: "deliveryId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "new_delivery_id, status, error_message" },
            "400": { description: "Not failed or unsupported" },
            "409": { description: "Job state changed or channel not configured" },
          },
        },
      },
      "/api/capability/seller/capability/{slug}/jobs": {
        get: {
          summary:
            "Phase 7 — paginated async execution history for a seller-owned capability (seller JWT)",
          operationId: "getSellerCapabilityJobs",
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100 },
            },
            {
              name: "status",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
            {
              name: "failure_class",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
            {
              name: "result_retention_state",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
            {
              name: "result_available",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["yes", "no"] },
            },
            {
              name: "since",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["24h", "7d", "30d", "all"] },
            },
            {
              name: "cursor_created_at",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
            { name: "cursor_id", in: "query", required: false, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "jobs[], next_cursor, filters_echo" },
            "403": { description: "Not owner" },
          },
        },
      },
      "/api/capability/seller/capability/{slug}/jobs/{jobId}": {
        get: {
          summary:
            "Phase 7 — seller job drill-down: metadata, retention, audit sample, policy snapshot (seller JWT)",
          operationId: "getSellerCapabilityJobDetail",
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
            { name: "jobId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "job, capability_summary, policy_snapshot, audit_sample" },
            "404": { description: "Job not found" },
          },
        },
      },
      "/api/capability/seller/capability/{slug}/diagnostics": {
        get: {
          summary:
            "Phase 7 — failure / trust / policy / retention / notification diagnostics for a window (seller JWT)",
          operationId: "getSellerCapabilityDiagnostics",
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
            {
              name: "window",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["24h", "7d", "30d"] },
            },
          ],
          responses: {
            "200": {
              description:
                "failure_class_distribution, job_window_counts, policy_snapshot, policy_audit_counts_window, trust_and_policy_signals, notification_delivery_window, insights",
            },
          },
        },
      },
      "/api/capability-job/{jobId}": {
        get: {
          summary: "Poll async capability job status",
          operationId: "getCapabilityJob",
          parameters: [
            { name: "jobId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description:
                "Job execution status (not payment attempt status). attempt_id = payment attempt id. result + buyer blocks derive from normalized result metadata (Phase 10.5); buyer.result_status_code/message (Phase 10)",
            },
          },
        },
      },
      "/api/capability-job/{jobId}/result": {
        get: {
          summary:
            "Retrieve full async capability result body (D1 inline or R2 when configured)",
          operationId: "getCapabilityJobResult",
          parameters: [
            { name: "jobId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Raw result body" },
            "404": { description: "Not stored or not available" },
            "409": { description: "Job not completed" },
            "410": { description: "Result expired or purged" },
            "503": { description: "R2 not configured" },
          },
        },
      },
      "/api/capability-origin-allowlist": {
        get: {
          summary:
            "List allowlisted hosts for a receiver (requires CAPABILITY_MANAGEMENT_SECRET)",
          operationId: "getCapabilityOriginAllowlist",
          parameters: [
            {
              name: "receiverAddress",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Allowlist entries" },
            "401": { description: "Unauthorized" },
            "503": { description: "Management not configured" },
          },
        },
        post: {
          summary: "Add allowlisted host (operator)",
          operationId: "postCapabilityOriginAllowlist",
          responses: {
            "200": { description: "Created" },
            "409": { description: "Duplicate" },
          },
        },
        delete: {
          summary: "Remove allowlisted host (operator)",
          operationId: "deleteCapabilityOriginAllowlist",
          responses: {
            "200": { description: "Removed" },
            "404": { description: "Not found" },
          },
        },
      },
      "/api/capability-ops/summary": {
        get: {
          summary:
            "Operational metrics for capability async jobs (requires CAPABILITY_MANAGEMENT_SECRET)",
          operationId: "getCapabilityOpsSummary",
          responses: { "200": { description: "Aggregated job stats" } },
        },
      },
      "/api/capability-proxy": {
        get: {
          summary: "Protected capability execution proxy",
          operationId: "getCapabilityProxy",
          parameters: [
            { name: "slug", in: "query", required: true, schema: { type: "string" } },
            {
              name: "attemptId",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { "200": { description: "Proxied JSON body" } },
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
