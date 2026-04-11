import { ALLOWED_ORIGIN } from './response'

/**
 * Payment requirements advertised to x402 clients (serialized into PAYMENT-REQUIRED).
 * Shape is intentionally loose until wired to a specific facilitator schema.
 */
export type X402PaymentRequirement = Record<string, unknown>

export type X402PaymentRequiredBody = Record<string, unknown>

export interface PaymentRequiredOptions {
  /** JSON body for the 402 response (merged with defaults). */
  body?: X402PaymentRequiredBody
  /** Value(s) serialized into the PAYMENT-REQUIRED header as JSON. */
  requirements: X402PaymentRequirement | X402PaymentRequirement[]
  init?: Omit<ResponseInit, 'status' | 'headers'> & {
    headers?: HeadersInit
  }
}

const DEFAULT_BODY: X402PaymentRequiredBody = {
  x402: true,
  status: 'payment_required',
}

/**
 * HTTP 402 with JSON body and PAYMENT-REQUIRED header (JSON-serialized requirements).
 */
export function paymentRequiredResponse(
  options: PaymentRequiredOptions,
): Response {
  const { body = {}, requirements, init = {} } = options
  const payload = { ...DEFAULT_BODY, ...body }
  const requirementsValue = Array.isArray(requirements)
    ? requirements
    : [requirements]
  const paymentRequiredHeader = JSON.stringify(requirementsValue)

  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('access-control-allow-origin', ALLOWED_ORIGIN)
  headers.set('PAYMENT-REQUIRED', paymentRequiredHeader)

  return new Response(JSON.stringify(payload), {
    ...init,
    status: 402,
    headers,
  })
}
