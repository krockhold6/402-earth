import type {
  CapabilityExposure,
  CapabilityLifecycle,
  CapabilityMcpType,
  CapabilityOriginTrust,
  ResourceDefinition,
  SellType,
} from '../types/resource'

import { rowDeliveryMode } from '../lib/deliveryMode'

function parseSellType(raw: unknown): SellType {
  const s = raw != null ? String(raw).trim().toLowerCase() : ''
  if (s === 'capability') return 'capability'
  return 'resource'
}

function parseReceiptMode(
  raw: unknown,
): 'standard' | 'detailed' | null {
  if (raw == null || String(raw).trim() === '') return null
  const s = String(raw).trim().toLowerCase()
  if (s === 'detailed') return 'detailed'
  if (s === 'standard') return 'standard'
  return null
}

function parseCapabilityLifecycle(
  raw: unknown,
  sellType: SellType,
): CapabilityLifecycle | null {
  if (sellType !== 'capability') return null
  if (raw == null || String(raw).trim() === '') return 'active'
  const s = String(raw).trim().toLowerCase()
  if (s === 'active' || s === 'disabled' || s === 'archived') {
    return s as CapabilityLifecycle
  }
  return 'active'
}

function parseCapabilityOriginTrust(
  raw: unknown,
): CapabilityOriginTrust | null {
  if (raw == null || String(raw).trim() === '') return null
  const s = String(raw).trim().toLowerCase()
  if (
    s === 'unverified' ||
    s === 'verified_domain' ||
    s === 'allowlisted' ||
    s === 'blocked'
  ) {
    return s as CapabilityOriginTrust
  }
  return null
}

function parseCapabilityExposure(
  raw: unknown,
  sellType: SellType,
): CapabilityExposure | null {
  if (sellType !== 'capability') return null
  const s = raw != null ? String(raw).trim().toLowerCase() : ''
  if (s === 'mcp' || s === 'both' || s === 'api') {
    return s as CapabilityExposure
  }
  return 'api'
}

function parseCapabilityMcpType(raw: unknown): CapabilityMcpType | null {
  if (raw == null || String(raw).trim() === '') return null
  const s = String(raw).trim().toLowerCase()
  if (s === 'tool' || s === 'resource' || s === 'prompt') {
    return s as CapabilityMcpType
  }
  return null
}

function rowToResource(row: Record<string, unknown>): ResourceDefinition {
  const pts = row.protected_ttl_seconds
  let protectedTtlSeconds: number | null = null
  if (pts != null && pts !== '') {
    const n = Number(pts)
    if (Number.isFinite(n)) protectedTtlSeconds = Math.floor(n)
  }
  const sellType = parseSellType(row.sell_type)
  return {
    slug: String(row.slug),
    label: String(row.label),
    sellType,
    amount: String(row.amount),
    currency: String(row.currency),
    network: String(row.network),
    receiverAddress: String(row.receiver_address),
    active: Number(row.active) === 1,
    unlockType: String(row.unlock_type),
    unlockValue:
      row.unlock_value != null && String(row.unlock_value) !== ''
        ? String(row.unlock_value)
        : null,
    deliveryMode: rowDeliveryMode(
      sellType,
      row.delivery_mode != null ? String(row.delivery_mode) : undefined,
    ),
    protectedTtlSeconds,
    oneTimeUnlock: Number(row.one_time_unlock) === 1,
    contentType:
      row.content_type != null && row.content_type !== ''
        ? String(row.content_type)
        : null,
    successRedirectPath:
      row.success_redirect_path != null && row.success_redirect_path !== ''
        ? String(row.success_redirect_path)
        : null,
    capabilityName:
      row.capability_name != null && String(row.capability_name).trim() !== ''
        ? String(row.capability_name)
        : null,
    endpoint:
      row.endpoint != null && String(row.endpoint).trim() !== ''
        ? String(row.endpoint)
        : null,
    httpMethod:
      row.http_method != null && String(row.http_method).trim() !== ''
        ? String(row.http_method)
        : null,
    inputFormat:
      row.input_format != null && String(row.input_format).trim() !== ''
        ? String(row.input_format)
        : null,
    resultFormat:
      row.result_format != null && String(row.result_format).trim() !== ''
        ? String(row.result_format)
        : null,
    receiptMode: parseReceiptMode(row.receipt_mode),
    capabilityEndpointCanonical:
      row.capability_endpoint_canonical != null &&
      String(row.capability_endpoint_canonical).trim() !== ''
        ? String(row.capability_endpoint_canonical)
        : null,
    capabilityOriginHost:
      row.capability_origin_host != null &&
      String(row.capability_origin_host).trim() !== ''
        ? String(row.capability_origin_host)
        : null,
    capabilityOriginTrust: parseCapabilityOriginTrust(row.capability_origin_trust),
    capabilityLifecycle: parseCapabilityLifecycle(
      row.capability_lifecycle,
      sellType,
    ),
    capabilityExposure: parseCapabilityExposure(row.capability_exposure, sellType),
    mcpName:
      row.mcp_name != null && String(row.mcp_name).trim() !== ''
        ? String(row.mcp_name).trim()
        : null,
    mcpDescription:
      row.mcp_description != null && String(row.mcp_description).trim() !== ''
        ? String(row.mcp_description).trim()
        : null,
    mcpType: parseCapabilityMcpType(row.mcp_type),
    mcpRequiresPayment:
      row.mcp_requires_payment == null ? null : Number(row.mcp_requires_payment) !== 0,
    capabilityNotifyEmail:
      row.capability_notify_email != null &&
      String(row.capability_notify_email).trim() !== ''
        ? String(row.capability_notify_email).trim()
        : null,
    capabilityNotifyWebhookUrl:
      row.capability_notify_webhook_url != null &&
      String(row.capability_notify_webhook_url).trim() !== ''
        ? String(row.capability_notify_webhook_url).trim()
        : null,
    capabilityNotifyEnabled: Number(row.capability_notify_enabled) === 1,
    capabilityNotifyOnComplete: Number(row.capability_notify_on_complete) !== 0,
    capabilityNotifyOnFail: Number(row.capability_notify_on_fail) !== 0,
    capabilityNotifyEmailEnabled:
      row.capability_notify_email_enabled === undefined ||
      Number(row.capability_notify_email_enabled) !== 0,
    capabilityNotifyWebhookEnabled:
      Number(row.capability_notify_webhook_enabled) === 1,
    capabilityCooldownSeconds: parseOptionalPositiveInt(
      row.capability_cooldown_seconds,
    ),
    capabilityMaxConcurrentAsync: parseOptionalPositiveInt(
      row.capability_max_concurrent_async,
    ),
    capabilityLastExecutionAt:
      row.capability_last_execution_at != null &&
      String(row.capability_last_execution_at).trim() !== ''
        ? String(row.capability_last_execution_at)
        : null,
    capabilityMaxExecutionsPer24h: parseOptionalPositiveInt(
      row.capability_max_executions_per_24h,
    ),
    capabilityMaxExecutionsPer7d: parseOptionalPositiveInt(
      row.capability_max_executions_per_7d,
    ),
    capabilityAutoPauseEnabled:
      Number(row.capability_auto_pause_enabled) === 1,
    capabilityAutoPauseThreshold: parseOptionalPositiveInt(
      row.capability_auto_pause_threshold,
    ),
    capabilityAutoPauseWindowSeconds: parseOptionalPositiveInt(
      row.capability_auto_pause_window_seconds,
    ),
    capabilityAutoPauseDurationSeconds: parseOptionalPositiveInt(
      row.capability_auto_pause_duration_seconds,
    ),
    capabilityAutoPausedUntil:
      row.capability_auto_paused_until != null &&
      String(row.capability_auto_paused_until).trim() !== ''
        ? String(row.capability_auto_paused_until)
        : null,
    capabilityAutoPauseReason:
      row.capability_auto_pause_reason != null &&
      String(row.capability_auto_pause_reason).trim() !== ''
        ? String(row.capability_auto_pause_reason)
        : null,
    capabilityManualPausedUntil:
      row.capability_manual_paused_until != null &&
      String(row.capability_manual_paused_until).trim() !== ''
        ? String(row.capability_manual_paused_until)
        : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function parseOptionalPositiveInt(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

export async function getResourceBySlug(
  db: D1Database,
  slug: string,
): Promise<ResourceDefinition | null> {
  const row = await db
    .prepare(
      `SELECT slug, label, amount, currency, network, receiver_address, active, unlock_type,
              unlock_value, delivery_mode, protected_ttl_seconds, one_time_unlock,
              content_type, success_redirect_path,
              sell_type, capability_name, endpoint, http_method, input_format, result_format, receipt_mode,
              capability_endpoint_canonical, capability_origin_host, capability_origin_trust,
              capability_lifecycle,
              capability_exposure, mcp_name, mcp_description, mcp_type, mcp_requires_payment,
              capability_notify_email, capability_notify_webhook_url,
              capability_notify_enabled, capability_notify_on_complete, capability_notify_on_fail,
              capability_notify_email_enabled, capability_notify_webhook_enabled,
              capability_cooldown_seconds, capability_max_concurrent_async, capability_last_execution_at,
              capability_max_executions_per_24h, capability_max_executions_per_7d,
              capability_auto_pause_enabled, capability_auto_pause_threshold,
              capability_auto_pause_window_seconds, capability_auto_pause_duration_seconds,
              capability_auto_paused_until, capability_auto_pause_reason,
              capability_manual_paused_until,
              created_at, updated_at
       FROM resource_definitions WHERE slug = ?`,
    )
    .bind(slug)
    .first<Record<string, unknown>>()
  return row ? rowToResource(row) : null
}

export type InsertResourceDefinitionInput = {
  slug: string
  label: string
  sellType: SellType
  amount: string
  currency: string
  network: string
  receiverAddress: string
  unlockType: string
  unlockValue: string | null
  deliveryMode: string
  protectedTtlSeconds: number | null
  oneTimeUnlock: boolean
  contentType: string | null
  successRedirectPath: string | null
  capabilityName: string | null
  endpoint: string | null
  httpMethod: string | null
  inputFormat: string | null
  resultFormat: string | null
  receiptMode: 'standard' | 'detailed' | null
  capabilityEndpointCanonical: string | null
  capabilityOriginHost: string | null
  capabilityOriginTrust: string | null
  capabilityLifecycle: CapabilityLifecycle | null
  capabilityExposure: CapabilityExposure | null
  mcpName: string | null
  mcpDescription: string | null
  mcpType: CapabilityMcpType | null
  mcpRequiresPayment: boolean | null
  createdAt: string
  updatedAt: string
}

export async function insertResourceDefinition(
  db: D1Database,
  input: InsertResourceDefinitionInput,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO resource_definitions (
        slug, label, amount, currency, network, receiver_address, active, unlock_type,
        unlock_value, delivery_mode, protected_ttl_seconds, one_time_unlock,
        content_type, success_redirect_path,
        sell_type, capability_name, endpoint, http_method, input_format, result_format, receipt_mode,
        capability_endpoint_canonical, capability_origin_host, capability_origin_trust,
        capability_lifecycle,
        capability_exposure, mcp_name, mcp_description, mcp_type, mcp_requires_payment,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.slug,
      input.label,
      input.amount,
      input.currency,
      input.network,
      input.receiverAddress,
      input.unlockType,
      input.unlockValue,
      input.deliveryMode,
      input.protectedTtlSeconds,
      input.oneTimeUnlock ? 1 : 0,
      input.contentType,
      input.successRedirectPath,
      input.sellType,
      input.capabilityName,
      input.endpoint,
      input.httpMethod,
      input.inputFormat,
      input.resultFormat,
      input.receiptMode,
      input.capabilityEndpointCanonical,
      input.capabilityOriginHost,
      input.capabilityOriginTrust,
      input.capabilityLifecycle,
      input.capabilityExposure,
      input.mcpName,
      input.mcpDescription,
      input.mcpType,
      input.mcpRequiresPayment == null ? null : input.mcpRequiresPayment ? 1 : 0,
      input.createdAt,
      input.updatedAt,
    )
    .run()
}

export async function updateCapabilityNotificationSettings(
  db: D1Database,
  slug: string,
  input: {
    capabilityNotifyEmail: string | null
    capabilityNotifyWebhookUrl: string | null
    capabilityNotifyEnabled: boolean
    capabilityNotifyOnComplete: boolean
    capabilityNotifyOnFail: boolean
    capabilityNotifyEmailEnabled: boolean
    capabilityNotifyWebhookEnabled: boolean
    updatedAt: string
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE resource_definitions SET
        capability_notify_email = ?,
        capability_notify_webhook_url = ?,
        capability_notify_enabled = ?,
        capability_notify_on_complete = ?,
        capability_notify_on_fail = ?,
        capability_notify_email_enabled = ?,
        capability_notify_webhook_enabled = ?,
        updated_at = ?
      WHERE slug = ? AND sell_type = 'capability'`,
    )
    .bind(
      input.capabilityNotifyEmail,
      input.capabilityNotifyWebhookUrl,
      input.capabilityNotifyEnabled ? 1 : 0,
      input.capabilityNotifyOnComplete ? 1 : 0,
      input.capabilityNotifyOnFail ? 1 : 0,
      input.capabilityNotifyEmailEnabled ? 1 : 0,
      input.capabilityNotifyWebhookEnabled ? 1 : 0,
      input.updatedAt,
      slug,
    )
    .run()
}

export async function updateCapabilityLastExecutionAt(
  db: D1Database,
  slug: string,
  input: { lastExecutionAt: string; updatedAt: string },
): Promise<void> {
  await db
    .prepare(
      `UPDATE resource_definitions SET
        capability_last_execution_at = ?,
        updated_at = ?
      WHERE slug = ? AND sell_type = 'capability'`,
    )
    .bind(input.lastExecutionAt, input.updatedAt, slug)
    .run()
}

export async function updateCapabilityPolicyFields(
  db: D1Database,
  slug: string,
  input: {
    cooldownSeconds: number | null
    maxConcurrentAsync: number | null
    maxExecutionsPer24h: number | null
    maxExecutionsPer7d: number | null
    autoPauseEnabled: boolean
    autoPauseThreshold: number | null
    autoPauseWindowSeconds: number | null
    autoPauseDurationSeconds: number | null
    manualPausedUntil: string | null
    updatedAt: string
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE resource_definitions SET
        capability_cooldown_seconds = ?,
        capability_max_concurrent_async = ?,
        capability_max_executions_per_24h = ?,
        capability_max_executions_per_7d = ?,
        capability_auto_pause_enabled = ?,
        capability_auto_pause_threshold = ?,
        capability_auto_pause_window_seconds = ?,
        capability_auto_pause_duration_seconds = ?,
        capability_manual_paused_until = ?,
        updated_at = ?
      WHERE slug = ? AND sell_type = 'capability'`,
    )
    .bind(
      input.cooldownSeconds,
      input.maxConcurrentAsync,
      input.maxExecutionsPer24h,
      input.maxExecutionsPer7d,
      input.autoPauseEnabled ? 1 : 0,
      input.autoPauseThreshold,
      input.autoPauseWindowSeconds,
      input.autoPauseDurationSeconds,
      input.manualPausedUntil,
      input.updatedAt,
      slug,
    )
    .run()
}

/** Clear expired manual / auto pause timestamps (Phase 8). */
export async function clearExpiredCapabilityPolicyPauses(
  db: D1Database,
  slug: string,
  nowIso: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE resource_definitions SET
        capability_auto_paused_until = CASE
          WHEN capability_auto_paused_until IS NOT NULL
               AND datetime(capability_auto_paused_until) <= datetime(?)
          THEN NULL ELSE capability_auto_paused_until END,
        capability_auto_pause_reason = CASE
          WHEN capability_auto_paused_until IS NOT NULL
               AND datetime(capability_auto_paused_until) <= datetime(?)
          THEN NULL ELSE capability_auto_pause_reason END,
        capability_manual_paused_until = CASE
          WHEN capability_manual_paused_until IS NOT NULL
               AND datetime(capability_manual_paused_until) <= datetime(?)
          THEN NULL ELSE capability_manual_paused_until END,
        updated_at = ?
      WHERE slug = ? AND sell_type = 'capability'`,
    )
    .bind(nowIso, nowIso, nowIso, nowIso, slug)
    .run()
}

export async function setCapabilityAutoPaused(
  db: D1Database,
  slug: string,
  input: { untilIso: string; reason: string; updatedAt: string },
): Promise<void> {
  await db
    .prepare(
      `UPDATE resource_definitions SET
        capability_auto_paused_until = ?,
        capability_auto_pause_reason = ?,
        updated_at = ?
      WHERE slug = ? AND sell_type = 'capability'`,
    )
    .bind(input.untilIso, input.reason, input.updatedAt, slug)
    .run()
}

export async function clearCapabilityExecutionPauses(
  db: D1Database,
  slug: string,
  updatedAt: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE resource_definitions SET
        capability_auto_paused_until = NULL,
        capability_auto_pause_reason = NULL,
        capability_manual_paused_until = NULL,
        updated_at = ?
      WHERE slug = ? AND sell_type = 'capability'`,
    )
    .bind(updatedAt, slug)
    .run()
}

export async function updateCapabilityResource(
  db: D1Database,
  slug: string,
  input: {
    label: string
    capabilityName: string | null
    endpoint: string | null
    httpMethod: string | null
    inputFormat: string | null
    resultFormat: string | null
    receiptMode: 'standard' | 'detailed' | null
    deliveryMode: string
    capabilityEndpointCanonical: string | null
    capabilityOriginHost: string | null
    capabilityOriginTrust: string | null
    capabilityLifecycle: CapabilityLifecycle
    capabilityExposure: CapabilityExposure
    mcpName: string | null
    mcpDescription: string | null
    mcpType: CapabilityMcpType | null
    mcpRequiresPayment: boolean | null
    updatedAt: string
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE resource_definitions SET
        label = ?,
        capability_name = ?,
        endpoint = ?,
        http_method = ?,
        input_format = ?,
        result_format = ?,
        receipt_mode = ?,
        delivery_mode = ?,
        capability_endpoint_canonical = ?,
        capability_origin_host = ?,
        capability_origin_trust = ?,
        capability_lifecycle = ?,
        capability_exposure = ?,
        mcp_name = ?,
        mcp_description = ?,
        mcp_type = ?,
        mcp_requires_payment = ?,
        updated_at = ?
      WHERE slug = ? AND sell_type = 'capability'`,
    )
    .bind(
      input.label,
      input.capabilityName,
      input.endpoint,
      input.httpMethod,
      input.inputFormat,
      input.resultFormat,
      input.receiptMode,
      input.deliveryMode,
      input.capabilityEndpointCanonical,
      input.capabilityOriginHost,
      input.capabilityOriginTrust,
      input.capabilityLifecycle,
      input.capabilityExposure,
      input.mcpName,
      input.mcpDescription,
      input.mcpType,
      input.mcpRequiresPayment == null ? null : input.mcpRequiresPayment ? 1 : 0,
      input.updatedAt,
      slug,
    )
    .run()
}

/** Seller-owned capabilities for analytics list (Phase 5) + Phase 7 index fields. */
export type SellerCapabilityMetaRow = {
  slug: string
  label: string
  capabilityName: string | null
  capabilityLifecycle: CapabilityLifecycle | null
  capabilityOriginTrust: string | null
  createdAt: string
  updatedAt: string
  deliveryMode: string
  receiptMode: 'standard' | 'detailed' | null
  capabilityNotifyEnabled: boolean
  capabilityNotifyEmailEnabled: boolean
  capabilityNotifyWebhookEnabled: boolean
  capabilityCooldownSeconds: number | null
  capabilityMaxConcurrentAsync: number | null
  capabilityLastExecutionAt: string | null
  capabilityMaxExecutionsPer24h: number | null
  capabilityMaxExecutionsPer7d: number | null
  capabilityAutoPauseEnabled: boolean
  capabilityAutoPauseThreshold: number | null
  capabilityAutoPauseWindowSeconds: number | null
  capabilityAutoPauseDurationSeconds: number | null
  capabilityAutoPausedUntil: string | null
  capabilityAutoPauseReason: string | null
  capabilityManualPausedUntil: string | null
}

export async function listSellerCapabilitiesMeta(
  db: D1Database,
  receiverAddress: string,
): Promise<SellerCapabilityMetaRow[]> {
  const res = await db
    .prepare(
      `SELECT slug, label, capability_name, capability_lifecycle, capability_origin_trust,
              created_at, updated_at,
              delivery_mode, receipt_mode,
              capability_notify_enabled, capability_notify_email_enabled, capability_notify_webhook_enabled,
              capability_cooldown_seconds, capability_max_concurrent_async, capability_last_execution_at,
              capability_max_executions_per_24h, capability_max_executions_per_7d,
              capability_auto_pause_enabled, capability_auto_pause_threshold,
              capability_auto_pause_window_seconds, capability_auto_pause_duration_seconds,
              capability_auto_paused_until, capability_auto_pause_reason, capability_manual_paused_until
       FROM resource_definitions
       WHERE LOWER(receiver_address) = LOWER(?) AND sell_type = 'capability' AND active = 1
       ORDER BY updated_at DESC`,
    )
    .bind(receiverAddress)
    .all<Record<string, unknown>>()
  return (res.results ?? []).map((row) => ({
    slug: String(row.slug),
    label: String(row.label),
    capabilityName:
      row.capability_name != null && String(row.capability_name).trim() !== ''
        ? String(row.capability_name)
        : null,
    capabilityLifecycle: parseCapabilityLifecycle(
      row.capability_lifecycle,
      'capability',
    ),
    capabilityOriginTrust:
      row.capability_origin_trust != null &&
      String(row.capability_origin_trust) !== ''
        ? String(row.capability_origin_trust)
        : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deliveryMode: rowDeliveryMode(
      'capability',
      row.delivery_mode != null ? String(row.delivery_mode) : undefined,
    ),
    receiptMode: parseReceiptMode(row.receipt_mode),
    capabilityNotifyEnabled: Number(row.capability_notify_enabled) === 1,
    capabilityNotifyEmailEnabled:
      row.capability_notify_email_enabled === undefined ||
      Number(row.capability_notify_email_enabled) !== 0,
    capabilityNotifyWebhookEnabled:
      Number(row.capability_notify_webhook_enabled) === 1,
    capabilityCooldownSeconds: parseOptionalPositiveInt(
      row.capability_cooldown_seconds,
    ),
    capabilityMaxConcurrentAsync: parseOptionalPositiveInt(
      row.capability_max_concurrent_async,
    ),
    capabilityLastExecutionAt:
      row.capability_last_execution_at != null &&
      String(row.capability_last_execution_at).trim() !== ''
        ? String(row.capability_last_execution_at)
        : null,
    capabilityMaxExecutionsPer24h: parseOptionalPositiveInt(
      row.capability_max_executions_per_24h,
    ),
    capabilityMaxExecutionsPer7d: parseOptionalPositiveInt(
      row.capability_max_executions_per_7d,
    ),
    capabilityAutoPauseEnabled:
      Number(row.capability_auto_pause_enabled) === 1,
    capabilityAutoPauseThreshold: parseOptionalPositiveInt(
      row.capability_auto_pause_threshold,
    ),
    capabilityAutoPauseWindowSeconds: parseOptionalPositiveInt(
      row.capability_auto_pause_window_seconds,
    ),
    capabilityAutoPauseDurationSeconds: parseOptionalPositiveInt(
      row.capability_auto_pause_duration_seconds,
    ),
    capabilityAutoPausedUntil:
      row.capability_auto_paused_until != null &&
      String(row.capability_auto_paused_until).trim() !== ''
        ? String(row.capability_auto_paused_until)
        : null,
    capabilityAutoPauseReason:
      row.capability_auto_pause_reason != null &&
      String(row.capability_auto_pause_reason).trim() !== ''
        ? String(row.capability_auto_pause_reason)
        : null,
    capabilityManualPausedUntil:
      row.capability_manual_paused_until != null &&
      String(row.capability_manual_paused_until).trim() !== ''
        ? String(row.capability_manual_paused_until)
        : null,
  }))
}
