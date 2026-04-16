import { ALLOWED_ORIGIN } from './response'
import { buildPaymentRequiredHeaderValue } from './paymentHeaders'

/**
 * Payment requirements advertised to x402 clients (serialized into PAYMENT-REQUIRED).
 * Shape is intentionally loose until wired to a specific facilitator schema.
 */
export type X402PaymentRequirement = Record<string, unknown>

export type X402PaymentRequiredBody = Record<string, unknown>

export interface PaymentRequiredOptions {
  /** JSON body for the 402 response (merged with defaults). */
  body?: X402PaymentRequiredBody
  /** Single object → base64(utf8(JSON)) on the wire (see `buildPaymentRequiredHeaderValue`). */
  requirements: X402PaymentRequirement
  init?: Omit<ResponseInit, 'status' | 'headers'> & {
    headers?: HeadersInit
  }
}

const DEFAULT_BODY: X402PaymentRequiredBody = {
  x402: true,
  status: 'payment_required',
}

/**
 * HTTP 402 with JSON body and PAYMENT-REQUIRED header (base64-encoded JSON object).
 */
export function paymentRequiredResponse(
  options: PaymentRequiredOptions,
): Response {
  const { body = {}, requirements, init = {} } = options
  const payload = { ...DEFAULT_BODY, ...body }
  const paymentRequiredHeader = buildPaymentRequiredHeaderValue(
    requirements as Record<string, unknown>,
  )

  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('access-control-allow-origin', ALLOWED_ORIGIN)
  headers.set('PAYMENT-REQUIRED', paymentRequiredHeader)
  headers.set('access-control-expose-headers', 'PAYMENT-REQUIRED')

  return new Response(JSON.stringify(payload), {
    ...init,
    status: 402,
    headers,
  })
}
