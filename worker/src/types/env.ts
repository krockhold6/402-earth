import type { CapabilityAsyncQueueMessage } from '../lib/capabilityAsyncQueueMessages'

/**
 * Worker bindings and secrets. Use this for new x402-native code paths;
 * `src/index.ts` may still declare its own `Env` until fully migrated.
 *
 * **Truth vs cache (Phase 10.5):** D1 (`DB`) is canonical for capability ownership, lifecycle,
 * jobs, audit, receipts, analytics inputs, and notification delivery rows. R2 (`CAPABILITY_RESULTS`)
 * is canonical for large result blobs. Queues (when bound) are **transport only** — never a
 * source of truth. This project does **not** use KV for capability correctness today; if KV is
 * added later, treat it strictly as optional acceleration with explicit TTL/invalidation rules.
 */
export interface Env {
  DB: D1Database
  /** CDP API key name (Key ID) for Bearer JWT auth to Business APIs. */
  COINBASE_CDP_API_KEY_ID?: string
  /** CDP API private key: ES256 PKCS#8 PEM, or Ed25519 64-byte base64 (seed||pub). */
  COINBASE_CDP_API_KEY_SECRET?: string
  /** Webhook signing secret (Hook0-style for Checkouts, or legacy Commerce HMAC). */
  COINBASE_WEBHOOK_SHARED_SECRET?: string
  SITE_URL?: string
  API_PUBLIC_URL?: string
  /** Base (or compatible) JSON-RPC URL for `eth_getTransactionReceipt` (e.g. https://mainnet.base.org). */
  BASE_RPC_URL?: string
  /**
   * Optional legacy fallback: USDC payee when `payment_attempts.receiver_address` is still
   * the migration placeholder (pre–per-resource receivers). Prefer per-resource `receiverAddress`.
   */
  PAYMENT_RECEIVER_ADDRESS?: string
  /**
   * When truthy (`true`, `1`, `yes`), `POST /x402/verify` uses mock facilitator success.
   * Use only in local/dev via `.dev.vars` — do not enable in production.
   */
  X402_MOCK_VERIFY?: string
  /** Resend API key (secret). Used for creator receipt email; never expose to browsers. */
  RESEND_API_KEY?: string
  /** Verified sender in Resend, e.g. `402 <mail@yourdomain.com>`. */
  RESEND_FROM?: string
  /**
   * Comma-separated hostnames treated as verified_domain for capability execution
   * (e.g. `api.example.com,cdn.example.com`).
   */
  CAPABILITY_VERIFIED_HOSTS?: string
  /**
   * When `true`, capability execution requires verified_domain or allowlisted origin;
   * unverified https URLs are blocked at execution time.
   */
  CAPABILITY_REQUIRE_TRUST?: string
  /**
   * Bearer secret for capability allowlist CRUD and `/api/capability-ops/summary`.
   * Send `Authorization: Bearer <secret>`. Omit in environments where management APIs are disabled.
   */
  CAPABILITY_MANAGEMENT_SECRET?: string
  /**
   * HS256 secret for seller JWTs (wallet-signed challenge → short-lived session).
   * Required for `/api/capability/seller/*` management routes.
   */
  CAPABILITY_SELLER_JWT_SECRET?: string
  /**
   * R2 bucket for large async capability results (bodies over inline D1 limit).
   * When unset, large results remain preview-only with honest metadata.
   */
  CAPABILITY_RESULTS?: R2Bucket
  /**
   * Phase 10.5 — primary durable async path: job execution + terminal notification fan-out.
   * Optional: when unset, cron continues to invoke `runCapabilityAsyncJob` directly.
   */
  CAPABILITY_ASYNC?: Queue<CapabilityAsyncQueueMessage>
}
