/** Row in `resource_definitions` — catalog entry for a payable resource. */
export interface ResourceDefinition {
  slug: string
  label: string
  amount: string
  currency: string
  network: string
  /** Lowercase `0x` + 40 hex — USDC payee on Base for Lane 1. */
  receiverAddress: string
  active: boolean
  unlockType: string
  /** Stored delivery payload; returned only after verified payment on `/x402/pay/…`. */
  unlockValue: string | null
  /** `direct` (default) or `protected` (link-only v1). */
  deliveryMode: 'direct' | 'protected'
  /**
   * TTL for protected unlock URLs in seconds; when null and mode is protected, server defaults to 900.
   */
  protectedTtlSeconds: number | null
  /** When true, minted unlock tokens allow a single successful redirect. */
  oneTimeUnlock: boolean
  contentType: string | null
  successRedirectPath: string | null
  createdAt: string
  updatedAt: string
}
