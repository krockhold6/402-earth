import type { ResourceDefinition } from '../types/resource'

import { normalizeDeliveryMode } from '../lib/deliveryMode'

function rowToResource(row: Record<string, unknown>): ResourceDefinition {
  const pts = row.protected_ttl_seconds
  let protectedTtlSeconds: number | null = null
  if (pts != null && pts !== '') {
    const n = Number(pts)
    if (Number.isFinite(n)) protectedTtlSeconds = Math.floor(n)
  }
  return {
    slug: String(row.slug),
    label: String(row.label),
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
    deliveryMode: normalizeDeliveryMode(
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
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export async function getResourceBySlug(
  db: D1Database,
  slug: string,
): Promise<ResourceDefinition | null> {
  const row = await db
    .prepare(
      `SELECT slug, label, amount, currency, network, receiver_address, active, unlock_type,
              unlock_value, delivery_mode, protected_ttl_seconds, one_time_unlock,
              content_type, success_redirect_path, created_at, updated_at
       FROM resource_definitions WHERE slug = ?`,
    )
    .bind(slug)
    .first<Record<string, unknown>>()
  return row ? rowToResource(row) : null
}

export type InsertResourceDefinitionInput = {
  slug: string
  label: string
  amount: string
  currency: string
  network: string
  receiverAddress: string
  unlockType: string
  unlockValue: string | null
  deliveryMode: 'direct' | 'protected'
  protectedTtlSeconds: number | null
  oneTimeUnlock: boolean
  contentType: string | null
  successRedirectPath: string | null
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
        content_type, success_redirect_path, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      input.createdAt,
      input.updatedAt,
    )
    .run()
}
