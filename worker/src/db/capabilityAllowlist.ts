import { createCapabilityAllowlistRowId } from '../lib/ids'
import { nowIso } from '../lib/time'

/** Normalize hostname for allowlist: lowercase ASCII, trim, strip trailing dot. */
export function normalizeAllowlistHost(raw: string): string {
  let h = raw.trim().toLowerCase()
  if (h.endsWith('.')) h = h.slice(0, -1)
  return h
}

/** True if seller wallet has an explicit allowlist row for this host (lowercase host). */
export async function isHostAllowlistedForReceiver(
  db: D1Database,
  receiverAddressLower: string,
  hostLower: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM capability_origin_allowlist
       WHERE receiver_address = ? AND host = ? LIMIT 1`,
    )
    .bind(receiverAddressLower, hostLower)
    .first<{ ok: number }>()
  return row != null
}

export type AllowlistRow = {
  id: string
  receiverAddress: string
  host: string
  createdAt: string
  note: string | null
  source: string | null
  createdByScope: string | null
  createdByIdentifier: string | null
}

export async function listAllowlistForReceiver(
  db: D1Database,
  receiverAddressLower: string,
): Promise<AllowlistRow[]> {
  const res = await db
    .prepare(
      `SELECT id, receiver_address, host, created_at, note, source, created_by_scope, created_by_identifier
       FROM capability_origin_allowlist
       WHERE receiver_address = ?
       ORDER BY host ASC`,
    )
    .bind(receiverAddressLower)
    .all<{
      id: string
      receiver_address: string
      host: string
      created_at: string
      note: string | null
      source: string | null
      created_by_scope: string | null
      created_by_identifier: string | null
    }>()
  return (res.results ?? []).map((r) => ({
    id: String(r.id),
    receiverAddress: String(r.receiver_address),
    host: String(r.host),
    createdAt: String(r.created_at),
    note: r.note != null ? String(r.note) : null,
    source: r.source != null ? String(r.source) : null,
    createdByScope: r.created_by_scope != null ? String(r.created_by_scope) : null,
    createdByIdentifier:
      r.created_by_identifier != null ? String(r.created_by_identifier) : null,
  }))
}

export async function insertAllowlistEntry(
  db: D1Database,
  input: {
    receiverAddressLower: string
    hostLower: string
    note?: string | null
    source?: string | null
    createdByScope?: 'seller' | 'operator' | null
    createdByIdentifier?: string | null
  },
): Promise<{ ok: true; id: string } | { ok: false; code: 'DUPLICATE' }> {
  const id = createCapabilityAllowlistRowId()
  const t = nowIso()
  try {
    await db
      .prepare(
        `INSERT INTO capability_origin_allowlist (id, receiver_address, host, created_at, note, source, created_by_scope, created_by_identifier)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.receiverAddressLower,
        input.hostLower,
        t,
        input.note ?? null,
        input.source ?? null,
        input.createdByScope ?? null,
        input.createdByIdentifier ?? null,
      )
      .run()
    return { ok: true, id }
  } catch {
    return { ok: false, code: 'DUPLICATE' }
  }
}

export async function deleteAllowlistEntry(
  db: D1Database,
  receiverAddressLower: string,
  hostLower: string,
): Promise<boolean> {
  const res = await db
    .prepare(
      `DELETE FROM capability_origin_allowlist WHERE receiver_address = ? AND host = ?`,
    )
    .bind(receiverAddressLower, hostLower)
    .run()
  return (res.meta?.changes ?? 0) > 0
}
