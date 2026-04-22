/**
 * HTTP entry routing for the 402 worker.
 *
 * **Route planes (Phase 10.5)** — keep boundaries explicit:
 * - **Public / buyer:** `/x402/*`, `/api/resource/*`, `/api/payment-attempt/*`, `/api/capability-job/*`,
 *   `/api/capability-proxy`, `/unlock/*` (SSR), discovery — no seller secrets; capabilities expose
 *   only what D1 + policy allow for the caller.
 * - **Seller control plane:** `/api/capability/seller/*` — wallet JWT (`CAPABILITY_SELLER_JWT_SECRET`);
 *   ownership enforced per handler (`assertCapabilityOwned`).
 * - **Operator / platform:** `/api/capability-origin-allowlist`, `/api/capability-ops/*` —
 *   `CAPABILITY_MANAGEMENT_SECRET` bearer; not seller JWT.
 *
 * See `worker/ROUTE_BOUNDARIES.md` and `worker/CAPABILITY_PLATFORM.md`.
 */
import {
  handleLegacyX402PaySession,
  tryLegacyCoinbaseCheckoutRoutes,
} from './legacy/coinbaseCheckoutSessionRoutes'
import {
  capabilityManagementAuthorized,
  managementNotConfiguredResponse,
  managementUnauthorizedResponse,
} from './lib/capabilityManagementAuth'
import { handleCapabilityAsyncQueueBatch } from './lib/capabilityAsyncQueue'
import { processCapabilityJobQueue } from './lib/capabilityScheduledExecutor'
import { corsAllowOrigin, withCors } from './lib/cors'
import { json } from './lib/response'
import {
  handleDeleteCapabilityAllowlist,
  handleGetCapabilityAllowlist,
  handlePostCapabilityAllowlist,
} from './routes/capabilityAllowlistManage'
import { handleGetCapabilityJob } from './routes/capabilityJob'
import { handleGetCapabilityJobResult } from './routes/capabilityJobResult'
import {
  handleDeleteSellerAllowlist,
  handleGetSellerAllowlist,
  handleGetSellerAnalyticsSummary,
  handleGetSellerCapabilityAudit,
  handleGetSellerCapabilityDetail,
  handleGetSellerCapabilityNotifications,
  handleGetSellerCapabilityWindowAnalytics,
  handlePostSellerCapabilityNotificationRetry,
  handlePostSellerCapabilityNotificationTest,
  handlePatchSellerCapability,
  handlePostCapabilitySellerAuth,
  handlePostCapabilitySellerChallenge,
  handlePostSellerAllowlist,
} from './routes/capabilitySeller'
import {
  handleGetSellerCapabilitiesIndex,
  handleGetSellerCapabilityDiagnostics,
  handleGetSellerCapabilityJobDetail,
  handleGetSellerCapabilityJobs,
} from './routes/capabilitySellerOps'
import { handleGetCapabilityOpsSummary } from './routes/capabilityOps'
import { handleGetCapabilityProxy } from './routes/capabilityProxy'
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

async function handleRequest(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(req.url)

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': corsAllowOrigin(req),
        'access-control-allow-methods': 'GET, HEAD, POST, DELETE, OPTIONS',
        'access-control-allow-headers':
          'content-type, authorization, x-402-client, payment-signature, payment-required',
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

    if (req.method === 'POST' && url.pathname === '/api/capability/seller/challenge') {
      res = await handlePostCapabilitySellerChallenge(env, req)
      return withCors(req, res)
    }

    if (req.method === 'POST' && url.pathname === '/api/capability/seller/auth') {
      res = await handlePostCapabilitySellerAuth(env, req)
      return withCors(req, res)
    }

    if (req.method === 'GET' && url.pathname === '/api/capability/seller/allowlist') {
      res = await handleGetSellerAllowlist(env, req, url)
      return withCors(req, res)
    }

    if (req.method === 'POST' && url.pathname === '/api/capability/seller/allowlist') {
      res = await handlePostSellerAllowlist(env, req)
      return withCors(req, res)
    }

    if (req.method === 'DELETE' && url.pathname === '/api/capability/seller/allowlist') {
      res = await handleDeleteSellerAllowlist(env, req, url)
      return withCors(req, res)
    }

    if (
      req.method === 'GET' &&
      url.pathname === '/api/capability/seller/analytics/summary'
    ) {
      res = await handleGetSellerAnalyticsSummary(env, req)
      return withCors(req, res)
    }

    if (
      req.method === 'GET' &&
      url.pathname === '/api/capability/seller/capabilities'
    ) {
      res = await handleGetSellerCapabilitiesIndex(env, req)
      return withCors(req, res)
    }

    const sellerCapJobDetail =
      req.method === 'GET' &&
      /^\/api\/capability\/seller\/capability\/([^/]+)\/jobs\/([^/]+)$/.exec(
        url.pathname,
      )
    if (sellerCapJobDetail) {
      const slug = decodeURIComponent(sellerCapJobDetail[1])
      const jobId = decodeURIComponent(sellerCapJobDetail[2])
      res = await handleGetSellerCapabilityJobDetail(env, req, slug, jobId)
      return withCors(req, res)
    }

    const sellerCapJobs =
      req.method === 'GET' &&
      /^\/api\/capability\/seller\/capability\/([^/]+)\/jobs$/.exec(url.pathname)
    if (sellerCapJobs) {
      const slug = decodeURIComponent(sellerCapJobs[1])
      res = await handleGetSellerCapabilityJobs(env, req, slug)
      return withCors(req, res)
    }

    const sellerCapDiagnostics =
      req.method === 'GET' &&
      /^\/api\/capability\/seller\/capability\/([^/]+)\/diagnostics$/.exec(
        url.pathname,
      )
    if (sellerCapDiagnostics) {
      const slug = decodeURIComponent(sellerCapDiagnostics[1])
      res = await handleGetSellerCapabilityDiagnostics(env, req, slug)
      return withCors(req, res)
    }

    const sellerCapAudit =
      req.method === 'GET' &&
      /^\/api\/capability\/seller\/capability\/([^/]+)\/audit$/.exec(url.pathname)
    if (sellerCapAudit) {
      const slug = decodeURIComponent(sellerCapAudit[1])
      res = await handleGetSellerCapabilityAudit(env, req, slug)
      return withCors(req, res)
    }

    const sellerCapWindowAnalytics =
      req.method === 'GET' &&
      /^\/api\/capability\/seller\/capability\/([^/]+)\/analytics$/.exec(
        url.pathname,
      )
    if (sellerCapWindowAnalytics) {
      const slug = decodeURIComponent(sellerCapWindowAnalytics[1])
      res = await handleGetSellerCapabilityWindowAnalytics(env, req, slug)
      return withCors(req, res)
    }

    const sellerCapNotificationsRetry =
      req.method === 'POST' &&
      /^\/api\/capability\/seller\/capability\/([^/]+)\/notifications\/([^/]+)\/retry$/.exec(
        url.pathname,
      )
    if (sellerCapNotificationsRetry) {
      const slug = decodeURIComponent(sellerCapNotificationsRetry[1])
      const deliveryId = decodeURIComponent(sellerCapNotificationsRetry[2])
      res = await handlePostSellerCapabilityNotificationRetry(
        env,
        req,
        slug,
        deliveryId,
      )
      return withCors(req, res)
    }

    const sellerCapNotificationsTest =
      req.method === 'POST' &&
      /^\/api\/capability\/seller\/capability\/([^/]+)\/notifications\/test$/.exec(
        url.pathname,
      )
    if (sellerCapNotificationsTest) {
      const slug = decodeURIComponent(sellerCapNotificationsTest[1])
      res = await handlePostSellerCapabilityNotificationTest(env, req, slug)
      return withCors(req, res)
    }

    const sellerCapNotifications =
      req.method === 'GET' &&
      /^\/api\/capability\/seller\/capability\/([^/]+)\/notifications$/.exec(
        url.pathname,
      )
    if (sellerCapNotifications) {
      const slug = decodeURIComponent(sellerCapNotifications[1])
      res = await handleGetSellerCapabilityNotifications(env, req, slug)
      return withCors(req, res)
    }

    const sellerCapPatch =
      req.method === 'PATCH' &&
      /^\/api\/capability\/seller\/capability\/([^/]+)$/.exec(url.pathname)
    if (sellerCapPatch) {
      const slug = decodeURIComponent(sellerCapPatch[1])
      res = await handlePatchSellerCapability(env, req, slug)
      return withCors(req, res)
    }

    const sellerCapGet =
      req.method === 'GET' &&
      /^\/api\/capability\/seller\/capability\/([^/]+)$/.exec(url.pathname)
    if (sellerCapGet) {
      const slug = decodeURIComponent(sellerCapGet[1])
      res = await handleGetSellerCapabilityDetail(env, req, slug)
      return withCors(req, res)
    }

    if (req.method === 'GET' && url.pathname === '/api/capability-proxy') {
      res = await handleGetCapabilityProxy(env, url)
      return withCors(req, res)
    }

    if (req.method === 'GET' && url.pathname === '/api/capability-ops/summary') {
      if (!env.CAPABILITY_MANAGEMENT_SECRET?.trim()) {
        res = managementNotConfiguredResponse()
      } else if (!capabilityManagementAuthorized(env, req)) {
        res = managementUnauthorizedResponse()
      } else {
        res = await handleGetCapabilityOpsSummary(env)
      }
      return withCors(req, res)
    }

    if (
      req.method === 'GET' &&
      url.pathname === '/api/capability-origin-allowlist'
    ) {
      if (!env.CAPABILITY_MANAGEMENT_SECRET?.trim()) {
        res = managementNotConfiguredResponse()
      } else if (!capabilityManagementAuthorized(env, req)) {
        res = managementUnauthorizedResponse()
      } else {
        res = await handleGetCapabilityAllowlist(env, url)
      }
      return withCors(req, res)
    }

    if (
      req.method === 'POST' &&
      url.pathname === '/api/capability-origin-allowlist'
    ) {
      if (!env.CAPABILITY_MANAGEMENT_SECRET?.trim()) {
        res = managementNotConfiguredResponse()
      } else if (!capabilityManagementAuthorized(env, req)) {
        res = managementUnauthorizedResponse()
      } else {
        res = await handlePostCapabilityAllowlist(env, req)
      }
      return withCors(req, res)
    }

    if (
      req.method === 'DELETE' &&
      url.pathname === '/api/capability-origin-allowlist'
    ) {
      if (!env.CAPABILITY_MANAGEMENT_SECRET?.trim()) {
        res = managementNotConfiguredResponse()
      } else if (!capabilityManagementAuthorized(env, req)) {
        res = managementUnauthorizedResponse()
      } else {
        res = await handleDeleteCapabilityAllowlist(env, req, url)
      }
      return withCors(req, res)
    }

    const capabilityJobResultGet =
      req.method === 'GET' &&
      /^\/api\/capability-job\/([^/]+)\/result$/.exec(url.pathname)
    if (capabilityJobResultGet) {
      const jobId = decodeURIComponent(capabilityJobResultGet[1])
      res = await handleGetCapabilityJobResult(env, jobId)
      return withCors(req, res)
    }

    const capabilityJobGet =
      req.method === 'GET' &&
      /^\/api\/capability-job\/([^/]+)$/.exec(url.pathname)
    if (capabilityJobGet) {
      const jobId = decodeURIComponent(capabilityJobGet[1])
      res = await handleGetCapabilityJob(env, jobId)
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
      res = await handleX402Pay(env, slug, url, req, ctx)
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
}

export default {
  fetch: handleRequest,
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(processCapabilityJobQueue(env))
  },
  async queue(
    batch: { messages: readonly { id: string; body: unknown; ack(): void; retry(): void }[] },
    env: Env,
  ): Promise<void> {
    await handleCapabilityAsyncQueueBatch(batch, env)
  },
}
