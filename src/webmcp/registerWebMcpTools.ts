import { createResource } from "@/lib/api"

const STATIC_PATHS = new Set([
  "/",
  "/buy",
  "/api",
  "/how-it-works",
  "/demo",
  "/terms",
  "/privacy",
])

function isAllowedPath(path: string): boolean {
  if (STATIC_PATHS.has(path)) return true
  if (
    path.startsWith("/unlock/") ||
    path.startsWith("/pay/") ||
    path.startsWith("/success/")
  ) {
    return true
  }
  return false
}

function navigateInApp(path: string): { ok: boolean; error?: string } {
  const p = path.trim()
  if (!p.startsWith("/") || p.startsWith("//")) {
    return { ok: false, error: "path must be a root-relative same-site path" }
  }
  if (!isAllowedPath(p)) {
    return { ok: false, error: "path is not allowlisted" }
  }
  window.location.assign(p)
  return { ok: true }
}

/**
 * Registers WebMCP tools when `navigator.modelContext` is available.
 * See https://webmachinelearning.github.io/webmcp/
 */
export function registerWebMcpTools(): void {
  const mc = typeof navigator !== "undefined" ? navigator.modelContext : undefined
  if (!mc?.registerTool) return

  const ac = new AbortController()
  window.addEventListener("pagehide", () => ac.abort(), { once: true })

  try {
    mc.registerTool(
      {
        name: "earth402.navigate",
        title: "Navigate",
        description:
          "Go to a public 402.earth page (/, /buy, /api, /how-it-works, /demo, /terms, /privacy, /unlock/:slug, /pay/:slug alias, /success/:slug).",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            path: {
              type: "string",
              description: "Root-relative path, e.g. /api or /buy",
            },
          },
          required: ["path"],
        },
        annotations: { readOnlyHint: true },
        async execute(input) {
          const path = String((input as { path?: string }).path ?? "")
          return navigateInApp(path)
        },
      },
      { signal: ac.signal },
    )
  } catch {
    /* duplicate registration (e.g. React StrictMode) */
  }

  try {
    mc.registerTool(
      {
        name: "earth402.create_resource",
        title: "Create x402 resource",
        description:
          "POST /api/resource on api.402.earth to create a sellable resource (label, amount, Base USDC receiver address).",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            amount: { type: "string" },
            receiverAddress: {
              type: "string",
              description: "Lowercase 0x + 40 hex Base USDC payee",
            },
            slug: { type: "string", description: "Optional slug" },
          },
          required: ["label", "amount", "receiverAddress"],
        },
        annotations: { readOnlyHint: false },
        async execute(input) {
          const body = input as {
            label?: string
            amount?: string
            receiverAddress?: string
            slug?: string
          }
          const { data } = await createResource({
            label: String(body.label ?? ""),
            amount: String(body.amount ?? ""),
            receiverAddress: String(body.receiverAddress ?? ""),
            slug: body.slug,
          })
          return data ?? { ok: false, error: "empty response" }
        },
      },
      { signal: ac.signal },
    )
  } catch {
    /* duplicate registration (e.g. React StrictMode) */
  }
}
