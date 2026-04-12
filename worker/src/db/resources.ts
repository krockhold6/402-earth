import type { ResourceDefinition } from '../types/resource'

function rowToResource(row: Record<string, unknown>): ResourceDefinition {
  return {
    slug: String(row.slug),
    label: String(row.label),
    amount: String(row.amount),
    currency: String(row.currency),
    network: String(row.network),
    active: Number(row.active) === 1,
    unlockType: String(row.unlock_type),
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
      `SELECT slug, label, amount, currency, network, active, unlock_type,
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
  unlockType: string
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
        slug, label, amount, currency, network, active, unlock_type,
        content_type, success_redirect_path, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.slug,
      input.label,
      input.amount,
      input.currency,
      input.network,
      input.unlockType,
      input.contentType,
      input.successRedirectPath,
      input.createdAt,
      input.updatedAt,
    )
    .run()
}
