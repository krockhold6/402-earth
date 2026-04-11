import {
  handleLegacyX402PaySession,
  tryLegacyCoinbaseCheckoutRoutes,
} from './legacy/coinbaseCheckoutSessionRoutes'
import { ALLOWED_ORIGIN, json } from './lib/response'
import { handleGetResource } from './routes/resource'
import { handlePostPaymentAttempt } from './routes/paymentAttempt'
import { handleGetPaymentAttemptById } from './routes/paymentAttemptById'
import { handleX402Pay } from './routes/x402Pay'
import { handleX402Verify } from './routes/x402Verify'
import type { Env } from './types/env'

export type { Env } from './types/env'
export type { PaymentSession } from './legacy/paymentSessionTypes'

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': ALLOWED_ORIGIN,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type, x-402-client',
        },
      })
    }

    const resourceGet =
      req.method === 'GET' && /^\/api\/resource\/([^/]+)$/.exec(url.pathname)
    if (resourceGet) {
      const slug = decodeURIComponent(resourceGet[1])
      return handleGetResource(env, slug)
    }

    if (req.method === 'POST' && url.pathname === '/api/payment-attempt') {
      return handlePostPaymentAttempt(env, req)
    }

    const paymentAttemptGet =
      req.method === 'GET' &&
      /^\/api\/payment-attempt\/([^/]+)$/.exec(url.pathname)
    if (paymentAttemptGet) {
      const id = paymentAttemptGet[1]
      return handleGetPaymentAttemptById(env, id)
    }

    const x402Pay =
      req.method === 'GET' && /^\/x402\/pay\/([^/]+)$/.exec(url.pathname)
    if (x402Pay) {
      const slug = decodeURIComponent(x402Pay[1])
      const attemptId = url.searchParams.get('attemptId')?.trim()
      const sessionId = url.searchParams.get('sessionId')?.trim()
      if (sessionId && !attemptId) {
        return handleLegacyX402PaySession(env, slug, sessionId)
      }
      return handleX402Pay(env, slug, url)
    }

    if (req.method === 'POST' && url.pathname === '/x402/verify') {
      return handleX402Verify(env, req)
    }

    const legacyResponse = await tryLegacyCoinbaseCheckoutRoutes(env, req, url)
    if (legacyResponse) return legacyResponse

    return json({ ok: false, error: 'Not found' }, { status: 404 })
  },
}
