export type UnlockTokenRow = {
  id: string
  token: string
  attemptId: string
  slug: string
  resourceType: string
  resourceValue: string
  createdAt: string
  expiresAt: string
  usedAt: string | null
  maxUses: number
  useCount: number
}

function rowToUnlockToken(row: Record<string, unknown>): UnlockTokenRow {
  return {
    id: String(row.id),
    token: String(row.token),
    attemptId: String(row.attempt_id),
    slug: String(row.slug),
    resourceType: String(row.resource_type),
    resourceValue: String(row.resource_value),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    usedAt:
      row.used_at != null && String(row.used_at) !== ''
        ? String(row.used_at)
        : null,
    maxUses: Number(row.max_uses),
    useCount: Number(row.use_count),
  }
}

export type InsertUnlockTokenInput = {
  id: string
  token: string
  attemptId: string
  slug: string
  resourceType: string
  resourceValue: string
  createdAt: string
  expiresAt: string
  maxUses: number
}

export async function insertUnlockToken(
  db: D1Database,
  input: InsertUnlockTokenInput,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO unlock_tokens (
        id, token, attempt_id, slug, resource_type, resource_value,
        created_at, expires_at, used_at, max_uses, use_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 0)`,
    )
    .bind(
      input.id,
      input.token,
      input.attemptId,
      input.slug,
      input.resourceType,
      input.resourceValue,
      input.createdAt,
      input.expiresAt,
      input.maxUses,
    )
    .run()
}

/** Reuse an active token for this attempt (idempotent paid replay), if any. */
export async function findActiveUnlockTokenForAttempt(
  db: D1Database,
  attemptId: string,
  nowIso: string,
): Promise<UnlockTokenRow | null> {
  const row = await db
    .prepare(
      `SELECT id, token, attempt_id, slug, resource_type, resource_value,
              created_at, expires_at, used_at, max_uses, use_count
       FROM unlock_tokens
       WHERE attempt_id = ?
         AND expires_at > ?
         AND use_count < max_uses
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(attemptId, nowIso)
    .first<Record<string, unknown>>()
  return row ? rowToUnlockToken(row) : null
}

export async function getUnlockTokenByToken(
  db: D1Database,
  token: string,
): Promise<UnlockTokenRow | null> {
  const row = await db
    .prepare(
      `SELECT id, token, attempt_id, slug, resource_type, resource_value,
              created_at, expires_at, used_at, max_uses, use_count
       FROM unlock_tokens WHERE token = ?`,
    )
    .bind(token)
    .first<Record<string, unknown>>()
  return row ? rowToUnlockToken(row) : null
}

export type ConsumeUnlockResult =
  | { kind: 'consumed'; redirectUrl: string }
  | { kind: 'not_found' }
  | { kind: 'gone' }

/**
 * Atomically consume one use of a valid token. Unknown token → not_found;
 * expired or exhausted (including races) → gone.
 */
export async function tryConsumeUnlockToken(
  db: D1Database,
  token: string,
  nowIso: string,
): Promise<ConsumeUnlockResult> {
  const result = (await db
    .prepare(
      `UPDATE unlock_tokens
       SET use_count = use_count + 1,
           used_at = IIF(use_count + 1 >= max_uses, ?, used_at)
       WHERE token = ?
         AND use_count < max_uses
         AND expires_at > ?`,
    )
    .bind(nowIso, token, nowIso)
    .run()) as { meta?: { changes?: number } }

  const changes = Number(result.meta?.changes ?? 0)
  if (changes > 0) {
    const row = await db
      .prepare(`SELECT resource_value FROM unlock_tokens WHERE token = ?`)
      .bind(token)
      .first<{ resource_value: string }>()
    if (row) {
      return { kind: 'consumed', redirectUrl: String(row.resource_value) }
    }
  }

  const probe = await getUnlockTokenByToken(db, token)
  if (!probe) return { kind: 'not_found' }
  return { kind: 'gone' }
}
