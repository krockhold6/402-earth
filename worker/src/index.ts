import {
  handleLegacyX402PaySession,
  tryLegacyCoinbaseCheckoutRoutes,
} from './legacy/coinbaseCheckoutSessionRoutes'
import { corsAllowOrigin, withCors } from './lib/cors'
import { json } from './lib/response'
import { handleGetResource, handlePostResource } from './routes/resource'
import { handlePostResourceEmailReceipt } from './routes/resourceEmailReceipt'
import { handlePostPaymentAttempt } from './routes/paymentAttempt'
import { handleGetPaymentAttemptById } from './routes/paymentAttemptById'
import { handleGetUnlock } from './routes/unlock'
import { handleX402Pay } from './routes/x402Pay'
import { handleX402Verify } from './routes/x402Verify'
import { tryDiscoveryRoutes } from './routes/discovery'
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
          'access-control-allow-origin': corsAllowOrigin(req),
          'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
          'access-control-allow-headers':
            'content-type, x-402-client, payment-signature, payment-required',
        },
      })
    }

    const discovery = tryDiscoveryRoutes(req)
    if (discovery) return withCors(req, discovery)

    let res: Response

    if (req.method === 'POST' && url.pathname === '/api/resource') {
      res = await handlePostResource(env, req)
      return withCors(req, res)
    }

    const resourceEmailReceiptPost =
      req.method === 'POST' &&
      /^\/api\/resource\/([^/]+)\/email-receipt$/.exec(url.pathname)
    if (resourceEmailReceiptPost) {
      const slug = decodeURIComponent(resourceEmailReceiptPost[1])
      res = await handlePostResourceEmailReceipt(env, slug, req)
      return withCors(req, res)
    }

    const resourceGet =
      req.method === 'GET' && /^\/api\/resource\/([^/]+)$/.exec(url.pathname)
    if (resourceGet) {
      const slug = decodeURIComponent(resourceGet[1])
      res = await handleGetResource(env, slug)
      return withCors(req, res)
    }

    if (req.method === 'POST' && url.pathname === '/api/payment-attempt') {
      res = await handlePostPaymentAttempt(env, req)
      return withCors(req, res)
    }

    const paymentAttemptGet =
      req.method === 'GET' &&
      /^\/api\/payment-attempt\/([^/]+)$/.exec(url.pathname)
    if (paymentAttemptGet) {
      const id = paymentAttemptGet[1]
      res = await handleGetPaymentAttemptById(env, id)
      return withCors(req, res)
    }

    const x402Pay =
      req.method === 'GET' && /^\/x402\/pay\/([^/]+)$/.exec(url.pathname)
    if (x402Pay) {
      const slug = decodeURIComponent(x402Pay[1])
      const attemptId = url.searchParams.get('attemptId')?.trim()
      const sessionId = url.searchParams.get('sessionId')?.trim()
      if (sessionId && !attemptId) {
        res = await handleLegacyX402PaySession(env, slug, sessionId)
        return withCors(req, res)
      }
      res = await handleX402Pay(env, slug, url, req)
      return withCors(req, res)
    }

    if (req.method === 'POST' && url.pathname === '/x402/verify') {
      res = await handleX402Verify(env, req)
      return withCors(req, res)
    }

    const unlockGet =
      req.method === 'GET' && /^\/unlock\/([^/]+)$/.exec(url.pathname)
    if (unlockGet) {
      const token = decodeURIComponent(unlockGet[1])
      res = await handleGetUnlock(env, token)
      return withCors(req, res)
    }

    const legacyResponse = await tryLegacyCoinbaseCheckoutRoutes(env, req, url)
    if (legacyResponse) return withCors(req, legacyResponse)

    res = json({ ok: false, error: 'Not found' }, { status: 404 })
    return withCors(req, res)
  },
}
