/**
 * Worker bindings and secrets. Use this for new x402-native code paths;
 * `src/index.ts` may still declare its own `Env` until fully migrated.
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
  /** USDC payee address on Base; must match the `to` of the verified Transfer log. */
  PAYMENT_RECEIVER_ADDRESS?: string
  /**
   * When truthy (`true`, `1`, `yes`), `POST /x402/verify` uses mock facilitator success.
   * Use only in local/dev via `.dev.vars` — do not enable in production.
   */
  X402_MOCK_VERIFY?: string
}
