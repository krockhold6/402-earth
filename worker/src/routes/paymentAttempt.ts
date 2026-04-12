import { createAttempt } from '../db/attempts'
import { getResourceBySlug } from '../db/resources'
import { createAttemptId } from '../lib/ids'
import { apiPublicUrl } from '../lib/publicUrl'
import { badRequest, json, notFound } from '../lib/response'
import { nowIso } from '../lib/time'
import type { PaymentClientType } from '../types/payment'
import type { Env } from '../types/env'

function parseClientType(raw: unknown): PaymentClientType {
  if (typeof raw !== 'string') return 'browser'
  const t = raw.toLowerCase()
  if (t === 'browser' || t === 'agent' || t === 'api') return t
  return 'browser'
}

export async function handlePostPaymentAttempt(
  env: Env,
  req: Request,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as
    | { slug?: string; clientType?: string }
    | null

  const slug = body?.slug?.trim()
  if (!slug) {
    return badRequest('slug required')
  }

  const clientType = parseClientType(body?.clientType)
  const resource = await getResourceBySlug(env.DB, slug)
  if (!resource || !resource.active) {
    return notFound('Resource not found')
  }

  const attemptId = createAttemptId()
  const t = nowIso()
  await createAttempt(env.DB, {
    id: attemptId,
    slug: resource.slug,
    label: resource.label,
    amount: resource.amount,
    currency: resource.currency,
    network: resource.network,
    receiverAddress: resource.receiverAddress,
    status: 'payment_required',
    clientType,
    paymentMethod: 'x402',
    createdAt: t,
    updatedAt: t,
  })

  const base = env.API_PUBLIC_URL?.replace(/\/$/, '') ?? apiPublicUrl(env, req)
  const resourceUrl = `${base}/x402/pay/${encodeURIComponent(slug)}?attemptId=${encodeURIComponent(attemptId)}`

  return json({
    ok: true,
    attemptId,
    status: 'payment_required' as const,
    resourceUrl,
    receiverAddress: resource.receiverAddress,
  })
}
