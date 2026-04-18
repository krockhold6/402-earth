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

/** Public resource from Worker v3 `GET /api/resource/:slug`. */
export type ApiResource = {
  slug: string
  label: string
  amount: string
  currency: string
  network: string
  active: boolean
  unlockType: string
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
  error?: string
}

export async function createResource(input: {
  label: string
  amount: string
  /** Lowercase `0x` + 40 hex — required by Worker `POST /api/resource`. */
  receiverAddress: string
  slug?: string
}): Promise<{ response: Response; data: CreateResourceResponse | null }> {
  const body: Record<string, string> = {
    label: input.label.trim(),
    amount: input.amount.trim(),
    receiverAddress: input.receiverAddress.trim(),
  }
  const s = input.slug?.trim()
  if (s) body.slug = s

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

/** Body from `GET /x402/pay/:slug?attemptId=…` after payment (or idempotent replay). */
export type X402PaidResourceBody = {
  ok: boolean
  status?: string
  slug?: string
  attemptId?: string
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
