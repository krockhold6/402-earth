/**
 * Phase 10.5 — Canonical **internal** capability descriptor for seller/control-plane surfaces.
 *
 * Intended for reuse by discovery/catalog, teams, and revenue intelligence later.
 * This is **not** a public marketplace schema — keep additive and seller-safe only.
 */

import type { ResourceDefinition } from '../types/resource'

export type InternalCapabilityDescriptor = {
  schema_version: 1
  identity: {
    slug: string
    label: string
    capability_name: string | null
  }
  ownership: {
    receiver_address: string
  }
  trust: {
    origin_trust_status: string | null
    endpoint_host: string | null
  }
  lifecycle: {
    capability_lifecycle: string | null
  }
  execution: {
    delivery_mode: string | null
    http_method: string | null
    endpoint: string | null
  }
  result_retention_profile: {
    receipt_mode: string | null
  }
  notifications: {
    enabled: boolean
    email_enabled: boolean
    webhook_enabled: boolean
    on_complete: boolean
    on_fail: boolean
  }
  /** Placeholders for later analytics/discovery wiring — always present, may be null. */
  analytics_summary_placeholder: null
  discovery_metadata_placeholder: null
}

export function buildInternalCapabilityDescriptor(
  resource: ResourceDefinition,
): InternalCapabilityDescriptor {
  return {
    schema_version: 1,
    identity: {
      slug: resource.slug,
      label: resource.label,
      capability_name: resource.capabilityName ?? null,
    },
    ownership: {
      receiver_address: resource.receiverAddress,
    },
    trust: {
      origin_trust_status: resource.capabilityOriginTrust ?? null,
      endpoint_host: resource.capabilityOriginHost ?? null,
    },
    lifecycle: {
      capability_lifecycle: resource.capabilityLifecycle ?? null,
    },
    execution: {
      delivery_mode: resource.deliveryMode ?? null,
      http_method: resource.httpMethod ?? null,
      endpoint: resource.endpoint ?? null,
    },
    result_retention_profile: {
      receipt_mode: resource.receiptMode ?? null,
    },
    notifications: {
      enabled: Boolean(resource.capabilityNotifyEnabled),
      email_enabled: resource.capabilityNotifyEmailEnabled !== false,
      webhook_enabled: resource.capabilityNotifyWebhookEnabled === true,
      on_complete: resource.capabilityNotifyOnComplete !== false,
      on_fail: resource.capabilityNotifyOnFail !== false,
    },
    analytics_summary_placeholder: null,
    discovery_metadata_placeholder: null,
  }
}
