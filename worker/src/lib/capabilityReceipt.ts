import type { OriginTrustStatus } from './capabilityOriginTrust'
import type { PaymentAttempt } from '../types/payment'
import type { CapabilityOriginTrust, ResourceDefinition } from '../types/resource'

export type CapabilityReceiptFields = Record<string, unknown>

/**
 * Shared capability receipt builder — same shape for direct, protected, async.
 * Detailed mode adds nullable scaffolding; never fabricates unknown values.
 */
export function buildCapabilityReceiptBase(input: {
  resource: ResourceDefinition
  attempt: PaymentAttempt
  executionStatus: string
  paidAt: string
  /** Overrides stored trust when re-evaluated at execution time */
  originTrust?: OriginTrustStatus | CapabilityOriginTrust | null
  originHost?: string | null
  detailedExtras?: Record<string, unknown> | null
}): CapabilityReceiptFields {
  const rid = `rec_${input.attempt.id}`
  const trustDisplay: OriginTrustStatus | CapabilityOriginTrust | null =
    input.originTrust ??
    input.resource.capabilityOriginTrust ??
    null
  const host =
    input.originHost ??
    input.resource.capabilityOriginHost ??
    null

  const base: CapabilityReceiptFields = {
    receipt_id: rid,
    paid_object_id: input.resource.slug,
    sell_type: 'capability',
    capability_name: input.resource.capabilityName ?? input.resource.label,
    endpoint: input.resource.endpoint,
    http_method: input.resource.httpMethod,
    input_format: input.resource.inputFormat,
    result_format: input.resource.resultFormat,
    delivery_mode: input.resource.deliveryMode,
    receipt_mode: input.resource.receiptMode ?? 'standard',
    amount_paid: input.attempt.amount,
    payout_wallet: input.resource.receiverAddress,
    payment_timestamp: input.paidAt,
    execution_status: input.executionStatus,
  }

  if (input.resource.receiptMode === 'detailed') {
    const extras: Record<string, unknown> = {
      origin_host: host,
      origin_trust_status: trustDisplay,
      execution_started_at: null,
      execution_completed_at: null,
      async_job_id: null,
      result_hash: null,
      provider_metadata: null,
      attempt_count: null,
      last_error_summary: null,
      ...input.detailedExtras,
    }
    return { ...base, ...extras }
  }

  return base
}
