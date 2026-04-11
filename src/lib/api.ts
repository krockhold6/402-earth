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
  contentType: string | null
  successRedirectPath: string | null
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

/** Worker `POST /x402/verify` (mock facilitator when `X402_MOCK_VERIFY` is set). */
export type X402VerifyResponse = {
  ok: boolean
  status?: string
  attemptId?: string
  idempotent?: boolean
  error?: string
  code?: string | null
}

export async function verifyX402Payment(input: {
  attemptId: string
  slug: string
  paymentSignature: string
}): Promise<{ response: Response; data: X402VerifyResponse | null }> {
  const res = await fetch(apiUrl("/x402/verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      attemptId: input.attemptId,
      slug: input.slug,
      paymentSignature: input.paymentSignature,
    }),
  })
  const data = (await res.json().catch(() => null)) as X402VerifyResponse | null
  return { response: res, data }
}
