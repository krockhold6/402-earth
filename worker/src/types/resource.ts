/** Top-level discriminator for rows in `resource_definitions`. */
export type SellType = 'resource' | 'capability'

/** How access is delivered for resources (async is invalid). */
export type ResourceDeliveryMode = 'direct' | 'protected'

/** How execution is delivered for capabilities. */
export type CapabilityDeliveryMode = 'direct' | 'protected' | 'async'

/** Origin trust for capability outbound execution (stored on create / revalidated at run). */
export type CapabilityOriginTrust =
  | 'unverified'
  | 'verified_domain'
  | 'allowlisted'
  | 'blocked'

/** Capability-only lifecycle (Phase 4). Resources use null. */
export type CapabilityLifecycle = 'active' | 'disabled' | 'archived'
export type CapabilityExposure = 'api' | 'mcp' | 'both'
export type CapabilityMcpType = 'tool' | 'resource' | 'prompt'

/** Stored `delivery_mode` — resources never use `async`. */
export type StoredDeliveryMode = ResourceDeliveryMode | CapabilityDeliveryMode

/** Row in `resource_definitions` — catalog entry for a payable object (resource or capability). */
export interface ResourceDefinition {
  slug: string
  label: string
  sellType: SellType
  amount: string
  currency: string
  network: string
  /** Lowercase `0x` + 40 hex — USDC payee on Base for Lane 1. */
  receiverAddress: string
  active: boolean
  unlockType: string
  /** Stored delivery payload; semantics depend on `sellType`. */
  unlockValue: string | null
  /** For `resource`: direct | protected. For `capability`: direct | protected | async. */
  deliveryMode: StoredDeliveryMode
  /**
   * TTL for protected unlock URLs in seconds; when null and mode is protected, server defaults to 900.
   */
  protectedTtlSeconds: number | null
  /** When true, minted unlock tokens allow a single successful redirect. */
  oneTimeUnlock: boolean
  contentType: string | null
  successRedirectPath: string | null
  /** Capability-only fields (null when `sellType` is `resource`). */
  capabilityName: string | null
  endpoint: string | null
  httpMethod: string | null
  inputFormat: string | null
  resultFormat: string | null
  receiptMode: 'standard' | 'detailed' | null
  /** Canonical https URL for the capability (Phase 2). */
  capabilityEndpointCanonical: string | null
  /** Normalized hostname for trust checks and receipts. */
  capabilityOriginHost: string | null
  /** Trust tier at last persist. */
  capabilityOriginTrust: CapabilityOriginTrust | null
  /** active | disabled | archived — null when sellType is resource. */
  capabilityLifecycle: CapabilityLifecycle | null
  /** Exposure surface for this capability (defaults to api for legacy rows). */
  capabilityExposure?: CapabilityExposure | null
  /** MCP metadata when exposure includes mcp. */
  mcpName?: string | null
  mcpDescription?: string | null
  mcpType?: CapabilityMcpType | null
  mcpRequiresPayment?: boolean | null
  /** Seller notification email for async terminal events (Phase 5). */
  capabilityNotifyEmail: string | null
  /** Optional HTTPS webhook for async terminal events. */
  capabilityNotifyWebhookUrl: string | null
  capabilityNotifyEnabled: boolean
  capabilityNotifyOnComplete: boolean
  capabilityNotifyOnFail: boolean
  /** When true, email channel may be used (Phase 6). */
  capabilityNotifyEmailEnabled: boolean
  /** When true, webhook channel may be used (Phase 6). */
  capabilityNotifyWebhookEnabled: boolean
  /** Minimum seconds between execution starts; null = no cooldown. */
  capabilityCooldownSeconds: number | null
  /** Max concurrent async jobs (pending/running/retry_scheduled); null = unlimited. */
  capabilityMaxConcurrentAsync: number | null
  /** Last execution start (async job create or sync fetch start). */
  capabilityLastExecutionAt: string | null
  /** Phase 8 — max successful execution starts (async jobs + sync) per rolling window; null = unlimited. */
  capabilityMaxExecutionsPer24h: number | null
  capabilityMaxExecutionsPer7d: number | null
  /** When true, repeated async terminal failures (non-trust/non-validation) can auto-pause the capability. */
  capabilityAutoPauseEnabled: boolean
  /** Failures counted within the window before triggering pause; default in code when null. */
  capabilityAutoPauseThreshold: number | null
  /** Sliding window (seconds) for counting qualifying failures. */
  capabilityAutoPauseWindowSeconds: number | null
  /** How long auto-pause lasts once triggered (seconds). */
  capabilityAutoPauseDurationSeconds: number | null
  /** When set and in the future, new executions are blocked (auto-pause). */
  capabilityAutoPausedUntil: string | null
  /** Short seller-facing reason for the last auto-pause. */
  capabilityAutoPauseReason: string | null
  /** Seller-set pause-until (independent of lifecycle). */
  capabilityManualPausedUntil: string | null
  createdAt: string
  updatedAt: string
}
