/** Worker origin: empty in dev (Vite proxies /api) or production API host. */
export function apiOrigin(): string {
  const raw = import.meta.env.VITE_API_ORIGIN as string | undefined
  if (raw !== undefined && raw !== "") return raw.replace(/\/$/, "")
  return import.meta.env.DEV ? "" : "https://api.402.earth"
}

export function apiUrl(path: string): string {
  const base = apiOrigin()
  const p = path.startsWith("/") ? path : `/${path}`
  return `${base}${p}`
}

export type SellType = "resource" | "capability"

/** Public resource from Worker v3 `GET /api/resource/:slug`. */
export type ApiResource = {
  slug: string
  label: string
  amount: string
  currency: string
  network: string
  active: boolean
  unlockType: string
  sellType?: SellType
  sell_type?: SellType
  deliveryMode?: "direct" | "protected" | "async"
  protectedTtlSeconds?: number | null
  oneTimeUnlock?: boolean
  /** Present on Worker responses when `unlock_value` is stored; never exposes the payload. */
  hasPaidPayload?: boolean
  contentType: string | null
  successRedirectPath: string | null
  /** Lowercase Base USDC payee (`0x` + 40 hex); may be missing on very old responses. */
  receiverAddress?: string
  /** Same as `receiverAddress`; kept for older responses. */
  paymentReceiverAddress: string | null
  /** USDC contract on Base for EIP-681 links; null if not applicable. */
  usdcContractAddress: string | null
  price_usdc?: string
  capabilityName?: string | null
  endpoint?: string | null
  httpMethod?: string | null
  inputFormat?: string | null
  resultFormat?: string | null
  receiptMode?: "standard" | "detailed" | null
  /** Phase 2 — canonical https URL for capability execution. */
  capabilityEndpointCanonical?: string | null
  capabilityOriginHost?: string | null
  capabilityOriginTrust?:
    | "unverified"
    | "verified_domain"
    | "allowlisted"
    | "blocked"
    | null
  /** Phase 4 — active / disabled / archived. */
  capabilityLifecycle?: "active" | "disabled" | "archived"
  /** When trust + lifecycle allow execution (from Worker). */
  executionAllowed?: boolean
  /**
   * Phase 8 — whether a new paid run is likely to start now (policy + gate peek).
   * Present on `GET /api/resource/:slug` for capabilities.
   */
  capability_buyer_execution?: {
    allowed: boolean
    code?: string
    summary?: string
  }
}

export type CapabilityLifecycle = "active" | "disabled" | "archived"

const SELLER_JWT_PREFIX = "402_cap_seller_jwt:"

export function getStoredSellerJwt(walletAddress: string): string | null {
  if (typeof sessionStorage === "undefined") return null
  const v = sessionStorage.getItem(
    `${SELLER_JWT_PREFIX}${walletAddress.toLowerCase()}`,
  )
  return v?.trim() ? v : null
}

export function setStoredSellerJwt(walletAddress: string, token: string): void {
  if (typeof sessionStorage === "undefined") return
  sessionStorage.setItem(
    `${SELLER_JWT_PREFIX}${walletAddress.toLowerCase()}`,
    token,
  )
}

export function clearStoredSellerJwt(walletAddress: string): void {
  if (typeof sessionStorage === "undefined") return
  sessionStorage.removeItem(
    `${SELLER_JWT_PREFIX}${walletAddress.toLowerCase()}`,
  )
}

export type SellerChallengeResponse = {
  ok: boolean
  challenge_id?: string
  message?: string
  expires_at?: string
  error?: string
}

export async function postCapabilitySellerChallenge(wallet: string): Promise<{
  response: Response
  data: SellerChallengeResponse | null
}> {
  const res = await fetch(apiUrl("/api/capability/seller/challenge"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet: wallet.trim() }),
  })
  const data = (await res.json().catch(() => null)) as
    | SellerChallengeResponse
    | null
  return { response: res, data }
}

export type SellerAuthResponse = {
  ok: boolean
  token?: string
  wallet?: string
  expires_in_seconds?: number
  error?: string
  code?: string
}

export async function postCapabilitySellerAuth(input: {
  wallet: string
  challengeId: string
  signature: `0x${string}`
}): Promise<{ response: Response; data: SellerAuthResponse | null }> {
  const res = await fetch(apiUrl("/api/capability/seller/auth"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: input.wallet.trim(),
      challenge_id: input.challengeId,
      signature: input.signature,
    }),
  })
  const data = (await res.json().catch(() => null)) as SellerAuthResponse | null
  return { response: res, data }
}

export type SellerNotificationSettings = {
  enabled: boolean
  email?: string | null
  webhook_url?: string | null
  /** Phase 6 — when false, email channel is not used even if an address is set. */
  email_enabled?: boolean
  /** Phase 6 — when false, webhook channel is not used. */
  webhook_enabled?: boolean
  on_complete: boolean
  on_fail: boolean
}

export type CapabilityPolicySnapshot = {
  cooldown_seconds?: number | null
  max_concurrent_async?: number | null
  last_execution_at?: string | null
  concurrent_async_jobs?: number
  cooldown_remaining_seconds?: number | null
  at_concurrency_limit?: boolean
  max_executions_per_24h?: number | null
  max_executions_per_7d?: number | null
  executions_started_24h?: number
  executions_started_7d?: number
  remaining_executions_24h?: number | null
  remaining_executions_7d?: number | null
  auto_pause_enabled?: boolean
  auto_pause_threshold?: number | null
  auto_pause_window_seconds?: number | null
  auto_pause_duration_seconds?: number | null
  auto_paused_until?: string | null
  auto_pause_reason?: string | null
  manual_paused_until?: string | null
  auto_pause_active?: boolean
  manual_pause_active?: boolean
  policy_denials_24h?: number
  policy_denials_7d?: number
  current_policy_block?: string | null
}

export type AnalyticsWindowId = "24h" | "7d" | "30d"

export type SellerCapabilityWindowAnalyticsResponse = {
  ok: boolean
  window?: AnalyticsWindowId
  current?: SellerCapabilityAnalytics
  prior_window?: SellerCapabilityAnalytics
  trends?: {
    executions_delta?: number
    successes_delta?: number
    failures_delta?: number
    success_rate_delta?: number | null
  }
  notification_delivery?: {
    total: number
    delivered: number
    failed: number
    pending: number
    success_rate: number | null
  }
  error?: string
}

/** Seller GET/PATCH capability — extends public resource with notification + timestamps. */
export type SellerCapabilityResource = ApiResource & {
  notification?: SellerNotificationSettings
  policy?: {
    cooldown_seconds?: number | null
    max_concurrent_async?: number | null
    last_execution_at?: string | null
    max_executions_per_24h?: number | null
    max_executions_per_7d?: number | null
    auto_pause_enabled?: boolean
    auto_pause_threshold?: number | null
    auto_pause_window_seconds?: number | null
    auto_pause_duration_seconds?: number | null
    auto_paused_until?: string | null
    auto_pause_reason?: string | null
    manual_paused_until?: string | null
  }
  created_at?: string
  updated_at?: string
}

export type SellerCapabilityAnalytics = {
  slug: string
  total_jobs: number
  completed_count: number
  failed_count: number
  retry_events: number
  avg_duration_ms: number | null
  last_job_created_at: string | null
  last_success_at: string | null
  last_failure_at: string | null
  full_result_still_available: number
  success_rate: number | null
  result_availability_rate: number | null
}

export type CapabilityInsightItem = {
  level: string
  code: string
  message: string
}

export type SellerCapabilityDetailResponse = {
  ok: boolean
  resource?: SellerCapabilityResource
  /** Phase 10.5 — internal normalized capability descriptor (seller JWT only). */
  capability_descriptor?: Record<string, unknown>
  jobs_by_status?: Record<string, number>
  analytics?: SellerCapabilityAnalytics
  insights?: CapabilityInsightItem[]
  recent_jobs?: {
    id: string
    status: string
    created_at: string
    updated_at: string
    attempt_count: number
    max_attempts: number
    last_error_summary: string | null
    result_preview: string | null
    result_retention_state?: string
    final_outcome?: string
    result_available?: number
    result_expires_at?: string | null
  }[]
  allowlist_entries?: unknown[]
  recent_notifications?: unknown[]
  policy_snapshot?: CapabilityPolicySnapshot
  audit_recent_summary?: { sample_events: unknown[] }
  error?: string
  code?: string
}

export async function fetchSellerCapabilityDetail(
  token: string,
  slug: string,
): Promise<SellerCapabilityDetailResponse> {
  const res = await fetch(
    apiUrl(
      `/api/capability/seller/capability/${encodeURIComponent(slug.trim())}`,
    ),
    {
      headers: { Authorization: `Bearer ${token.trim()}` },
    },
  )
  const data = (await res.json().catch(() => null)) as
    | SellerCapabilityDetailResponse
    | null
  if (!data) return { ok: false, error: "Invalid response" }
  return data
}

export async function fetchSellerCapabilityWindowAnalytics(
  token: string,
  slug: string,
  window: AnalyticsWindowId,
): Promise<SellerCapabilityWindowAnalyticsResponse> {
  const res = await fetch(
    apiUrl(
      `/api/capability/seller/capability/${encodeURIComponent(slug.trim())}/analytics?window=${encodeURIComponent(window)}`,
    ),
    {
      headers: { Authorization: `Bearer ${token.trim()}` },
    },
  )
  const data = (await res.json().catch(() => null)) as
    | SellerCapabilityWindowAnalyticsResponse
    | null
  if (!data) return { ok: false, error: "Invalid response" }
  return data
}

export type SellerNotificationDeliveryRow = {
  id: string
  created_at: string
  job_id: string | null
  event_type: string
  channel: string
  status: string
  attempted_at: string | null
  completed_at: string | null
  error_message: string | null
}

export type SellerNotificationDeliveriesResponse = {
  ok: boolean
  deliveries?: SellerNotificationDeliveryRow[]
  filters_echo?: {
    status: string | null
    channel: string | null
    limit: number
  }
  summary?: {
    total_returned: number
    failed_in_page: number
    delivered_in_page: number
    pending_in_page: number
    latest_status: string | null
    latest_failed: SellerNotificationDeliveryRow | null
    latest_delivered: SellerNotificationDeliveryRow | null
    delivery_health: string
  }
  error?: string
}

export async function fetchSellerCapabilityNotificationDeliveries(
  token: string,
  slug: string,
  limit = 50,
  filters?: { status?: string; channel?: string },
): Promise<SellerNotificationDeliveriesResponse> {
  const sp = new URLSearchParams()
  sp.set("limit", String(limit))
  if (filters?.status?.trim()) sp.set("status", filters.status.trim())
  if (filters?.channel?.trim()) sp.set("channel", filters.channel.trim())
  const res = await fetch(
    apiUrl(
      `/api/capability/seller/capability/${encodeURIComponent(slug.trim())}/notifications?${sp.toString()}`,
    ),
    {
      headers: { Authorization: `Bearer ${token.trim()}` },
    },
  )
  const data = (await res.json().catch(() => null)) as
    | SellerNotificationDeliveriesResponse
    | null
  if (!data) return { ok: false, error: "Invalid response" }
  return data
}

export type SellerNotificationTestResponse = {
  ok: boolean
  results?: {
    channel: string
    delivery_id: string
    status: string
    error_message: string | null
  }[]
  error?: string | null
  code?: string
}

export async function postSellerCapabilityNotificationTest(
  token: string,
  slug: string,
): Promise<SellerNotificationTestResponse> {
  const res = await fetch(
    apiUrl(
      `/api/capability/seller/capability/${encodeURIComponent(slug.trim())}/notifications/test`,
    ),
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token.trim()}` },
    },
  )
  const data = (await res.json().catch(() => null)) as
    | SellerNotificationTestResponse
    | null
  if (!data) return { ok: false, error: "Invalid response" }
  return data
}

export type SellerNotificationRetryResponse = {
  ok: boolean
  new_delivery_id?: string
  status?: string
  error_message?: string | null
  code?: string
  error?: string
}

export async function postSellerCapabilityNotificationRetry(
  token: string,
  slug: string,
  deliveryId: string,
): Promise<SellerNotificationRetryResponse> {
  const res = await fetch(
    apiUrl(
      `/api/capability/seller/capability/${encodeURIComponent(slug.trim())}/notifications/${encodeURIComponent(deliveryId.trim())}/retry`,
    ),
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token.trim()}` },
    },
  )
  const data = (await res.json().catch(() => null)) as
    | SellerNotificationRetryResponse
    | null
  if (!data) return { ok: false, error: "Invalid response" }
  return data
}

/** Phase 7 — seller capability index + cross-capability operations summary. */
export type SellerCapabilitiesIndexResponse = {
  ok: boolean
  operations_summary?: Record<string, unknown>
  capabilities?: Record<string, unknown>[]
  error?: string
  code?: string
}

export async function fetchSellerCapabilitiesIndex(
  token: string,
): Promise<SellerCapabilitiesIndexResponse> {
  const res = await fetch(apiUrl("/api/capability/seller/capabilities"), {
    headers: { Authorization: `Bearer ${token.trim()}` },
  })
  const data = (await res.json().catch(() => null)) as
    | SellerCapabilitiesIndexResponse
    | null
  if (!data) return { ok: false, error: "Invalid response" }
  return data
}

export type SellerCapabilityJobsResponse = {
  ok: boolean
  slug?: string
  jobs?: Record<string, unknown>[]
  next_cursor?: { cursor_created_at: string; cursor_id: string } | null
  filters_echo?: Record<string, unknown>
  error?: string
  code?: string
}

export async function fetchSellerCapabilityJobs(
  token: string,
  slug: string,
  query: {
    limit?: number
    status?: string
    failure_class?: string
    result_retention_state?: string
    result_available?: "yes" | "no"
    since?: "24h" | "7d" | "30d" | "all"
    cursor_created_at?: string
    cursor_id?: string
  } = {},
): Promise<SellerCapabilityJobsResponse> {
  const q = new URLSearchParams()
  if (query.limit != null) q.set("limit", String(query.limit))
  if (query.status) q.set("status", query.status)
  if (query.failure_class) q.set("failure_class", query.failure_class)
  if (query.result_retention_state) {
    q.set("result_retention_state", query.result_retention_state)
  }
  if (query.result_available) q.set("result_available", query.result_available)
  if (query.since) q.set("since", query.since)
  if (query.cursor_created_at) q.set("cursor_created_at", query.cursor_created_at)
  if (query.cursor_id) q.set("cursor_id", query.cursor_id)
  const qs = q.toString()
  const res = await fetch(
    apiUrl(
      `/api/capability/seller/capability/${encodeURIComponent(slug.trim())}/jobs${qs ? `?${qs}` : ""}`,
    ),
    { headers: { Authorization: `Bearer ${token.trim()}` } },
  )
  const data = (await res.json().catch(() => null)) as
    | SellerCapabilityJobsResponse
    | null
  if (!data) return { ok: false, error: "Invalid response" }
  return data
}

export type SellerCapabilityJobDetailResponse = {
  ok: boolean
  job?: Record<string, unknown>
  capability_summary?: Record<string, unknown>
  policy_snapshot?: CapabilityPolicySnapshot
  audit_sample?: Record<string, unknown>[]
  error?: string
  code?: string
}

export async function fetchSellerCapabilityJobDetail(
  token: string,
  slug: string,
  jobId: string,
): Promise<SellerCapabilityJobDetailResponse> {
  const res = await fetch(
    apiUrl(
      `/api/capability/seller/capability/${encodeURIComponent(slug.trim())}/jobs/${encodeURIComponent(jobId.trim())}`,
    ),
    { headers: { Authorization: `Bearer ${token.trim()}` } },
  )
  const data = (await res.json().catch(() => null)) as
    | SellerCapabilityJobDetailResponse
    | null
  if (!data) return { ok: false, error: "Invalid response" }
  return data
}

export type SellerCapabilityDiagnosticsResponse = {
  ok: boolean
  window?: string
  window_since_modifier?: string
  failure_class_distribution?: { failure_class: string | null; count: number }[]
  most_recent_failure?: Record<string, unknown> | null
  job_window_counts?: Record<string, unknown>
  policy_snapshot?: CapabilityPolicySnapshot
  policy_audit_counts_window?: {
    policy_denied?: number
    auto_paused?: number
    auto_pause_cleared?: number
  }
  trust_and_policy_signals?: Record<string, unknown>
  notification_delivery_window?: Record<string, unknown>
  insights?: CapabilityInsightItem[]
  error?: string
}

export async function fetchSellerCapabilityDiagnostics(
  token: string,
  slug: string,
  window: AnalyticsWindowId = "7d",
): Promise<SellerCapabilityDiagnosticsResponse> {
  const res = await fetch(
    apiUrl(
      `/api/capability/seller/capability/${encodeURIComponent(slug.trim())}/diagnostics?window=${encodeURIComponent(window)}`,
    ),
    { headers: { Authorization: `Bearer ${token.trim()}` } },
  )
  const data = (await res.json().catch(() => null)) as
    | SellerCapabilityDiagnosticsResponse
    | null
  if (!data) return { ok: false, error: "Invalid response" }
  return data
}

export type SellerCapabilityPatchResponse = {
  ok: boolean
  resource?: SellerCapabilityResource
  error?: string
  code?: string
}

export async function patchSellerCapability(input: {
  token: string
  slug: string
  body: Record<
    string,
    | string
    | boolean
    | number
    | null
    | undefined
    | CapabilityLifecycle
  >
}): Promise<{ response: Response; data: SellerCapabilityPatchResponse | null }> {
  const res = await fetch(
    apiUrl(
      `/api/capability/seller/capability/${encodeURIComponent(input.slug.trim())}`,
    ),
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.token.trim()}`,
      },
      body: JSON.stringify(input.body),
    },
  )
  const data = (await res.json().catch(() => null)) as
    | SellerCapabilityPatchResponse
    | null
  return { response: res, data }
}

export async function postSellerAllowlistEntry(input: {
  token: string
  receiverAddress: string
  host: string
  note?: string
}): Promise<{
  response: Response
  data: { ok: boolean; error?: string; code?: string } | null
}> {
  const res = await fetch(apiUrl("/api/capability/seller/allowlist"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.token.trim()}`,
    },
    body: JSON.stringify({
      receiver_address: input.receiverAddress.trim(),
      host: input.host.trim(),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    }),
  })
  const data = (await res.json().catch(() => null)) as {
    ok: boolean
    error?: string
    code?: string
  } | null
  return { response: res, data }
}

export type ApiResourceResponse = {
  ok: boolean
  resource?: ApiResource
  error?: string
}

export async function fetchResource(
  slug: string,
): Promise<ApiResourceResponse> {
  const res = await fetch(apiUrl(`/api/resource/${encodeURIComponent(slug)}`))
  const data = (await res.json().catch(() => null)) as ApiResourceResponse | null
  if (!data) return { ok: false, error: "Invalid response" }
  return data
}

export type CreateResourceResponse = {
  ok: boolean
  resource?: ApiResource
  paymentUrl?: string
  /** Same payment target as `paymentUrl` (Worker alias for QR / share flows). */
  qrUrl?: string
  sell_type?: SellType
  error?: string
}

export type CreatorReceiptEmailResponse = {
  ok: boolean
  error?: string
}

/** Creator receipt — uses Worker + Resend; safe to call only after a resource exists. */
export async function sendCreatorReceiptEmail(input: {
  slug: string
  email: string
}): Promise<{
  response: Response
  data: CreatorReceiptEmailResponse | null
}> {
  const res = await fetch(
    apiUrl(
      `/api/resource/${encodeURIComponent(input.slug.trim())}/email-receipt`,
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: input.email.trim() }),
    },
  )
  const data = (await res.json().catch(() => null)) as
    | CreatorReceiptEmailResponse
    | null
  return { response: res, data }
}

export type CreateResourceInput =
  | {
      sellType?: "resource"
      label: string
      amount: string
      /** Lowercase `0x` + 40 hex — required by Worker `POST /api/resource`. */
      receiverAddress: string
      slug?: string
      unlockType?: string
      unlockValue?: string
      destinationUrl?: string
      deliveryMode?: "direct" | "protected"
      /** Omitted or empty lets the Worker default protected TTL to 900 seconds. */
      protectedTtlSeconds?: number
      oneTimeUnlock?: boolean
    }
  | {
      sellType: "capability"
      capabilityName: string
      amount: string
      receiverAddress: string
      endpoint: string
      httpMethod: string
      inputFormat: string
      resultFormat: string
      deliveryMode: "direct" | "protected" | "async"
      receiptMode: "standard" | "detailed"
      slug?: string
    }

export async function createResource(
  input: CreateResourceInput,
): Promise<{ response: Response; data: CreateResourceResponse | null }> {
  let body: Record<string, string | number | boolean>
  if (input.sellType === "capability") {
    body = {
      sell_type: "capability",
      capability_name: input.capabilityName.trim(),
      price_usdc: input.amount.trim(),
      payout_wallet: input.receiverAddress.trim(),
      endpoint: input.endpoint.trim(),
      http_method: input.httpMethod.trim().toUpperCase(),
      input_format: input.inputFormat.trim(),
      result_format: input.resultFormat.trim(),
      delivery_mode: input.deliveryMode,
      receipt_mode: input.receiptMode,
    }
    const s = input.slug?.trim()
    if (s) body.slug = s
  } else {
    body = {
      label: input.label.trim(),
      amount: input.amount.trim(),
      receiverAddress: input.receiverAddress.trim(),
    }
    const s = input.slug?.trim()
    if (s) body.slug = s
    if (input.unlockType?.trim()) body.unlockType = input.unlockType.trim()
    if (input.unlockValue !== undefined) body.unlockValue = input.unlockValue
    if (input.destinationUrl !== undefined)
      body.destination_url = input.destinationUrl
    if (input.deliveryMode) body.deliveryMode = input.deliveryMode
    if (input.protectedTtlSeconds !== undefined) {
      body.protectedTtlSeconds = input.protectedTtlSeconds
    }
    if (input.oneTimeUnlock !== undefined) body.oneTimeUnlock = input.oneTimeUnlock
  }

  const res = await fetch(apiUrl("/api/resource"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => null)) as
    | CreateResourceResponse
    | null
  return { response: res, data }
}

export type PaymentAttemptCreateResponse = {
  ok: boolean
  attemptId?: string
  status?: string
  resourceUrl?: string
  error?: string
  code?: string
}

export async function createPaymentAttempt(input: {
  slug: string
  clientType: "browser" | "agent" | "api"
}): Promise<{ response: Response; data: PaymentAttemptCreateResponse | null }> {
  const res = await fetch(apiUrl("/api/payment-attempt"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: input.slug,
      clientType: input.clientType,
    }),
  })
  const data = (await res.json().catch(() => null)) as
    | PaymentAttemptCreateResponse
    | null
  return { response: res, data }
}

/** Status values from Worker v3 `payment_attempts.status`. */
export type PaymentAttemptStatus =
  | "created"
  | "payment_required"
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled"

/** Public attempt from `GET /api/payment-attempt/:id`. */
export type PaymentAttemptPayload = {
  id: string
  slug: string
  label: string
  amount: string
  currency: string
  network: string
  status: PaymentAttemptStatus | string
  clientType: string
  paymentMethod: string
  payerAddress: string | null
  paymentSignatureHash: string | null
  txHash: string | null
  createdAt: string
  updatedAt: string
  paidAt: string | null
  expiresAt: string | null
  paymentReceiverAddress?: string | null
}

export type PaymentAttemptGetResponse = {
  ok: boolean
  attempt?: PaymentAttemptPayload
  error?: string
}

export async function fetchPaymentAttempt(
  attemptId: string,
): Promise<PaymentAttemptGetResponse> {
  const res = await fetch(
    apiUrl(`/api/payment-attempt/${encodeURIComponent(attemptId)}`),
  )
  const data = (await res.json().catch(() => null)) as
    | PaymentAttemptGetResponse
    | null
  if (!data) return { ok: false, error: "Invalid response" }
  return data
}

/** Worker `POST /x402/verify` — production uses `txHash`; mock worker uses `paymentSignature`. */
export type X402VerifyResponse = {
  ok: boolean
  status?: string
  attemptId?: string
  idempotent?: boolean
  error?: string
  code?: string | null
}

export type VerifyX402Input = {
  attemptId: string
  slug: string
  /** Base USDC transaction hash after the user sends payment (production path). */
  txHash?: string
  /** Local/dev when the worker has `X402_MOCK_VERIFY` enabled. */
  paymentSignature?: string
}

/** Phase 10 — server-driven buyer outcome summary (capabilities). */
export type CapabilityBuyerOutcomeSummary = {
  delivery_mode: "direct" | "protected" | "async"
  async_job_id: string | null
  execution_status: string
  result_lifecycle: string
  result_status_code: string
  result_status_message: string
  poll_url?: string | null
  retrieval_url?: string | null
}

/** Body from `GET /x402/pay/:slug?attemptId=…` after payment (or idempotent replay). */
export type X402PaidResourceBody = {
  ok: boolean
  status?: string
  slug?: string
  attemptId?: string
  sellType?: SellType
  capabilityReceipt?: Record<string, unknown>
  /** Phase 10 — concise execution/result messaging for buyer UI. */
  capability_buyer_outcome?: CapabilityBuyerOutcomeSummary
  resource?: { type: string; value: unknown }
  error?: string
  code?: string
}

export async function fetchPaidX402Resource(
  slug: string,
  attemptId: string,
): Promise<{ response: Response; data: X402PaidResourceBody | null }> {
  const res = await fetch(
    apiUrl(
      `/x402/pay/${encodeURIComponent(slug)}?attemptId=${encodeURIComponent(attemptId)}`,
    ),
  )
  const data = (await res.json().catch(() => null)) as X402PaidResourceBody | null
  return { response: res, data }
}

/** `GET /api/capability-job/:id` — async capability job lifecycle. */
export type CapabilityJobStatus =
  | "pending"
  | "running"
  | "retry_scheduled"
  | "completed"
  | "failed"

export type CapabilityJobPollResponse = {
  ok: boolean
  id?: string
  slug?: string
  attempt_id?: string
  status?: CapabilityJobStatus | string
  created_at?: string
  updated_at?: string
  started_at?: string | null
  last_attempt_started_at?: string | null
  completed_at?: string | null
  failed_at?: string | null
  attempt_count?: number
  max_attempts?: number
  next_retry_at?: string | null
  failure_class?: string | null
  will_retry?: boolean
  permanent_failure?: boolean
  result_http_status?: number | null
  result_hash?: string | null
  result_preview?: string | null
  result?: {
    preview_available?: boolean
    full_result_available?: boolean
    /** Phase 5: available | expired | deleted | preview_only | not_stored */
    retention_state?: string
    storage_kind?: string | null
    content_type?: string | null
    size_bytes?: number | null
    expires_at?: string | null
    retrieval_url?: string | null
  }
  last_error_summary?: string | null
  provider_metadata?: unknown
  capability?: {
    slug: string
    capability_name: string | null
    delivery_mode: string
    http_method: string | null
    endpoint_host: string | null
    origin_trust_status: string | null
  } | null
  attempt_verified_paid?: boolean
  poll?: { interval_ms_suggested: number } | null
  /** Phase 9 — execution vs result semantics for buyers. */
  buyer?: {
    result_lifecycle?: string
    execution_status?: string
    retention_state?: string
    preview_available?: boolean
    full_result_available?: boolean
    retrieval_url?: string | null
    expires_at?: string | null
    /** Phase 10 — aligns with `capability_buyer_outcome` on paid payload. */
    result_status_code?: string
    result_status_message?: string
  }
  error?: string
}

export async function fetchCapabilityJob(
  jobId: string,
): Promise<CapabilityJobPollResponse> {
  const res = await fetch(
    apiUrl(`/api/capability-job/${encodeURIComponent(jobId)}`),
  )
  const data = (await res.json().catch(() => null)) as
    | CapabilityJobPollResponse
    | null
  if (!data) return { ok: false, error: "Invalid response" }
  return data
}

export async function verifyX402Payment(
  input: VerifyX402Input,
): Promise<{ response: Response; data: X402VerifyResponse | null }> {
  const body: Record<string, string> = {
    attemptId: input.attemptId,
    slug: input.slug,
  }
  const tx = input.txHash?.trim()
  if (tx) body.txHash = tx
  const sig = input.paymentSignature
  if (sig !== undefined && sig !== "") body.paymentSignature = sig

  const res = await fetch(apiUrl("/x402/verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => null)) as X402VerifyResponse | null
  return { response: res, data }
}

/** Legacy Coinbase checkout session (`GET /api/payment-session/:id`). */
export type LegacyPaymentSessionPayload = {
  sessionId: string
  slug: string
  label: string
  amount: string
  currency: string
  paymentMethod: string
  status: string
  provider: string | null
  providerRef: string | null
  successUrl: string
  cancelUrl: string
  createdAt: string
  paidAt: string | null
  expiresAt: string
}

export type LegacyPaymentSessionResponse = {
  ok: boolean
  session?: LegacyPaymentSessionPayload
  error?: string
}

export async function fetchLegacyPaymentSession(
  sessionId: string,
): Promise<LegacyPaymentSessionResponse> {
  const res = await fetch(
    apiUrl(`/api/payment-session/${encodeURIComponent(sessionId)}`),
  )
  const data = (await res.json().catch(() => null)) as
    | LegacyPaymentSessionResponse
    | null
  if (!data) return { ok: false, error: "Invalid response" }
  return data
}
