import { getAttemptById } from '../db/attempts'
import { getResourceBySlug } from '../db/resources'
import { json } from '../lib/response'
import {
  parsePaymentSignatureHeaderValue,
  readPaymentSignatureHeader,
  type ParsedPaymentSignature,
} from '../lib/paymentHeaders'
import { buildPaidSuccessPayload } from '../lib/paidResourcePayload'
import {
  resolveExpectedReceiver,
  resolveExpectedReceiverForResource,
} from '../lib/receiverAddress'
import { paymentRequiredResponse } from '../lib/x402'
import { verifyAndSettlePaymentAttempt } from '../lib/x402VerificationFlow'
import type { Env } from '../types/env'
import { publicResourceDefinition } from './resource'

const VERIFY_SOURCE = 'x402_pay_get'

type X402PayLogBranch =
  | 'no_signature'
  | 'malformed_signature'
  | 'missing_attempt_context'
  | 'verification_failed'
  | 'verification_retryable_error'
  | 'verification_succeeded'

function logX402PayBranch(
  branch: X402PayLogBranch,
  fields: Record<string, string | number | boolean | undefined>,
): void {
  const row: Record<string, unknown> = { source: VERIFY_SOURCE, branch }
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) row[k] = v
  }
  console.log(JSON.stringify(row))
}

/** Single canonical object encoded as base64(JSON) in PAYMENT-REQUIRED. */
function wireRequirements(input: {
  amount: string
  payTo: string
  resourceUrl: string
  slug: string
  label: string
  description: string
  attemptId: string | null
}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    scheme: 'exact',
    network: 'base',
    currency: 'USDC',
    amount: input.amount,
    payTo: input.payTo,
    resource: input.resourceUrl,
    slug: input.slug,
    label: input.label,
    description: input.description,
  }
  if (input.attemptId) {
    base.attemptId = input.attemptId
  }
  return base
}

function payeeMisconfiguredResponse(slug: string): Response {
  return json(
    {
      ok: false,
      error:
        'Payment receiver is not configured for this resource. Set receiverAddress on the resource or PAYMENT_RECEIVER_ADDRESS for legacy rows.',
      code: 'PAYEE_NOT_CONFIGURED',
      slug,
    },
    { status: 503 },
  )
}


export async function handleX402Pay(
  env: Env,
  slug: string,
  url: URL,
  req: Request,
): Promise<Response> {
  const attemptId = url.searchParams.get('attemptId')?.trim() || null
  const resourceUrl = url.href
  const paymentSigHeader = readPaymentSignatureHeader(req)

  let parsedSignature: Extract<ParsedPaymentSignature, { ok: true }> | undefined
  if (paymentSigHeader) {
    const parsed = parsePaymentSignatureHeaderValue(paymentSigHeader)
    if (!parsed.ok) {
      logX402PayBranch('malformed_signature', { slug, httpStatus: 400 })
      return json(
        {
          ok: false,
          error: parsed.message,
          code: 'MALFORMED_PAYMENT_SIGNATURE',
          slug,
        },
        { status: 400 },
      )
    }
    if (!attemptId) {
      logX402PayBranch('missing_attempt_context', { slug, httpStatus: 400 })
      return json(
        {
          ok: false,
          error:
            'PAYMENT-SIGNATURE verification requires attemptId in the query string. Create an attempt via POST /api/payment-attempt, then retry this URL with ?attemptId=… and PAYMENT-SIGNATURE, or use POST /x402/verify after paying in the browser.',
          code: 'ATTEMPT_CONTEXT_REQUIRED',
          slug,
        },
        { status: 400 },
      )
    }
    parsedSignature = parsed
  }

  const resource = await getResourceBySlug(env.DB, slug)
  if (!resource || !resource.active) {
    return json(
      {
        ok: false,
        error: 'Resource not found or inactive',
        code: 'RESOURCE_NOT_FOUND',
        slug,
      },
      { status: 404 },
    )
  }

  if (parsedSignature) {
    const aid = attemptId as string
    const attempt = await getAttemptById(env.DB, aid)
    if (!attempt || attempt.slug !== resource.slug) {
      return json(
        {
          ok: false,
          error: 'Payment attempt not found for this resource',
          code: 'ATTEMPT_NOT_FOUND',
          slug,
          attemptId: aid,
        },
        { status: 404 },
      )
    }

    if (attempt.status === 'paid') {
      const paid = await buildPaidSuccessPayload(env, {
        resource,
        attempt,
        attemptIdInQuery: aid,
      })
      logX402PayBranch('verification_succeeded', {
        slug: resource.slug,
        outcome: paid.ok ? 'already_paid' : 'delivery_error',
        httpStatus: paid.ok ? 200 : paid.status,
      })
      return json(paid.body, { status: paid.ok ? 200 : paid.status })
    }

    const settle = await verifyAndSettlePaymentAttempt(env, {
      attempt,
      slug: resource.slug,
      paymentSignature: parsedSignature.paymentSignature,
      txHash: parsedSignature.txHash ?? undefined,
      source: VERIFY_SOURCE,
    })

    if (settle.kind === 'paid_idempotent' || settle.kind === 'settled') {
      const paid = await buildPaidSuccessPayload(env, {
        resource,
        attempt,
        attemptIdInQuery: aid,
      })
      logX402PayBranch('verification_succeeded', {
        slug: resource.slug,
        outcome: paid.ok ? settle.kind : 'delivery_error',
        httpStatus: paid.ok ? 200 : paid.status,
      })
      return json(paid.body, { status: paid.ok ? 200 : paid.status })
    }

    const retryable =
      settle.payload &&
      typeof settle.payload === 'object' &&
      !Array.isArray(settle.payload) &&
      (settle.payload as Record<string, unknown>).retryable === true
    if (retryable) {
      logX402PayBranch('verification_retryable_error', {
        slug: resource.slug,
        httpStatus: settle.httpStatus,
        attemptId: aid,
        code: String((settle.payload as Record<string, unknown>).code ?? ''),
        classification: String(
          (settle.payload as Record<string, unknown>).classification ?? '',
        ),
      })
    } else {
      logX402PayBranch('verification_failed', {
        slug: resource.slug,
        httpStatus: settle.httpStatus,
        attemptId: aid,
        code: String((settle.payload as Record<string, unknown>).code ?? ''),
      })
    }
    return json(settle.payload, { status: settle.httpStatus })
  }

  if (!attemptId) {
    const payTo = resolveExpectedReceiverForResource(resource, env)
    if (!payTo) {
      return payeeMisconfiguredResponse(resource.slug)
    }
    logX402PayBranch('no_signature', { slug: resource.slug, httpStatus: 402 })
    return paymentRequiredResponse({
      body: {
        ok: false,
        resource: publicResourceDefinition(resource),
      },
      requirements: wireRequirements({
        amount: resource.amount,
        payTo,
        resourceUrl,
        slug: resource.slug,
        label: resource.label,
        description: resource.label,
        attemptId: null,
      }),
    })
  }

  const attempt = await getAttemptById(env.DB, attemptId)
  if (!attempt || attempt.slug !== resource.slug) {
    return json(
      {
        ok: false,
        error: 'Payment attempt not found for this resource',
        code: 'ATTEMPT_NOT_FOUND',
        slug: resource.slug,
        attemptId,
      },
      { status: 404 },
    )
  }

  if (attempt.status === 'paid') {
    const paid = await buildPaidSuccessPayload(env, {
      resource,
      attempt,
      attemptIdInQuery: attemptId,
    })
    logX402PayBranch('verification_succeeded', {
      slug: resource.slug,
      outcome: paid.ok ? 'already_paid' : 'delivery_error',
      httpStatus: paid.ok ? 200 : paid.status,
    })
    return json(paid.body, { status: paid.ok ? 200 : paid.status })
  }

  const payTo = resolveExpectedReceiver(attempt, env)
  if (!payTo) {
    return payeeMisconfiguredResponse(resource.slug)
  }

  logX402PayBranch('no_signature', { slug: resource.slug, httpStatus: 402 })
  return paymentRequiredResponse({
    body: {
      ok: false,
      attemptId: attempt.id,
      resource: publicResourceDefinition(resource),
    },
    requirements: wireRequirements({
      amount: attempt.amount,
      payTo,
      resourceUrl,
      slug: resource.slug,
      label: attempt.label,
      description: attempt.label,
      attemptId: attempt.id,
    }),
  })
}
