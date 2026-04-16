import { getAttemptById } from '../db/attempts'
import { badRequest, json } from '../lib/response'
import { verifyAndSettlePaymentAttempt } from '../lib/x402VerificationFlow'
import type { Env } from '../types/env'

const VERIFY_SOURCE = 'x402_verify'

export async function handleX402Verify(
  env: Env,
  req: Request,
): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('Invalid JSON body')
  }

  const o = body as Record<string, unknown>
  const attemptId =
    typeof o.attemptId === 'string' ? o.attemptId.trim() : ''
  const slug = typeof o.slug === 'string' ? o.slug.trim() : ''
  const paymentSignature =
    typeof o.paymentSignature === 'string' ? o.paymentSignature : ''
  const txHashRaw = typeof o.txHash === 'string' ? o.txHash.trim() : ''

  if (!attemptId) return badRequest('attemptId is required')
  if (!slug) return badRequest('slug is required')

  const attempt = await getAttemptById(env.DB, attemptId)
  if (!attempt) {
    return json(
      {
        ok: false,
        error: 'Payment attempt not found',
        code: 'ATTEMPT_NOT_FOUND',
        attemptId,
      },
      { status: 404 },
    )
  }
  if (attempt.slug !== slug) {
    return badRequest('slug does not match this attempt')
  }

  const result = await verifyAndSettlePaymentAttempt(env, {
    attempt,
    slug,
    paymentSignature,
    txHash: txHashRaw || undefined,
    source: VERIFY_SOURCE,
  })

  if (result.kind === 'paid_idempotent') {
    return json({
      ok: true,
      status: 'paid' as const,
      attemptId: result.attemptId,
      idempotent: true,
    })
  }

  if (result.kind === 'settled') {
    return json({
      ok: true,
      status: 'paid' as const,
      attemptId: result.attemptId,
    })
  }

  return json(result.payload, { status: result.httpStatus })
}
