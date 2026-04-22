import { nowIso } from '../lib/time'

export async function insertSellerChallenge(
  db: D1Database,
  input: { id: string; wallet: string; message: string; expiresAt: string },
): Promise<void> {
  const t = nowIso()
  await db
    .prepare(
      `INSERT INTO capability_seller_challenges (id, wallet, message, expires_at, used_at, created_at)
       VALUES (?, ?, ?, ?, NULL, ?)`,
    )
    .bind(input.id, input.wallet, input.message, input.expiresAt, t)
    .run()
}

export async function getSellerChallengeIfValid(
  db: D1Database,
  id: string,
  walletLower: string,
): Promise<{ message: string } | null> {
  const row = await db
    .prepare(
      `SELECT message, expires_at, used_at, wallet FROM capability_seller_challenges WHERE id = ?`,
    )
    .bind(id)
    .first<{
      message: string
      expires_at: string
      used_at: string | null
      wallet: string
    }>()
  if (!row) return null
  if (row.used_at != null && String(row.used_at) !== '') return null
  if (String(row.wallet).toLowerCase() !== walletLower) return null
  if (Date.parse(String(row.expires_at)) < Date.now()) return null
  return { message: String(row.message) }
}

export async function consumeSellerChallenge(
  db: D1Database,
  id: string,
): Promise<void> {
  const t = nowIso()
  await db
    .prepare(
      `UPDATE capability_seller_challenges SET used_at = ? WHERE id = ? AND used_at IS NULL`,
    )
    .bind(t, id)
    .run()
}
