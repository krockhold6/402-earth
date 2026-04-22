import {
  deleteAllowlistEntry,
  insertAllowlistEntry,
  listAllowlistForReceiver,
  normalizeAllowlistHost,
} from '../db/capabilityAllowlist'
import { parseReceiverAddressForResource } from '../lib/receiverAddress'
import { badRequest, json } from '../lib/response'
import type { Env } from '../types/env'

/** GET — list allowlisted hosts for a receiver (management secret). */
export async function handleGetCapabilityAllowlist(
  env: Env,
  url: URL,
): Promise<Response> {
  const raw = url.searchParams.get('receiverAddress')?.trim() ?? ''
  const parsed = parseReceiverAddressForResource(raw)
  if (!parsed.ok) {
    return badRequest(parsed.message)
  }
  const rows = await listAllowlistForReceiver(env.DB, parsed.value)
  return json({
    ok: true,
    receiver_address: parsed.value,
    entries: rows.map((r) => ({
      id: r.id,
      host: r.host,
      created_at: r.createdAt,
      note: r.note,
      source: r.source,
    })),
  })
}

/** POST — add allowlisted host. */
export async function handlePostCapabilityAllowlist(
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
  const recv = parseReceiverAddressForResource(
    typeof o.receiver_address === 'string'
      ? o.receiver_address
      : typeof o.receiverAddress === 'string'
        ? o.receiverAddress
        : '',
  )
  if (!recv.ok) return badRequest(recv.message)

  const hostRaw = typeof o.host === 'string' ? o.host : ''
  const host = normalizeAllowlistHost(hostRaw)
  if (!host || host.length > 253) {
    return badRequest('host is required (valid hostname)')
  }

  const note =
    typeof o.note === 'string' && o.note.trim() !== '' ? o.note.trim() : null
  const source =
    typeof o.source === 'string' && o.source.trim() !== ''
      ? o.source.trim()
      : null

  const ins = await insertAllowlistEntry(env.DB, {
    receiverAddressLower: recv.value,
    hostLower: host,
    note,
    source,
    createdByScope: 'operator',
    createdByIdentifier: 'management_api',
  })
  if (!ins.ok) {
    return json(
      {
        ok: false,
        error: 'This host is already allowlisted for this receiver',
        code: 'DUPLICATE',
      },
      { status: 409 },
    )
  }

  return json({
    ok: true,
    id: ins.id,
    receiver_address: recv.value,
    host,
  })
}

/** DELETE — remove allowlisted host (JSON body or query). */
export async function handleDeleteCapabilityAllowlist(
  env: Env,
  req: Request,
  url: URL,
): Promise<Response> {
  let receiverRaw =
    url.searchParams.get('receiverAddress')?.trim() ??
    url.searchParams.get('receiver_address')?.trim() ??
    ''
  let hostRaw = url.searchParams.get('host')?.trim() ?? ''

  if (!receiverRaw || !hostRaw) {
    try {
      const body = await req.json()
      const o = body as Record<string, unknown>
      receiverRaw =
        typeof o.receiver_address === 'string'
          ? o.receiver_address
          : typeof o.receiverAddress === 'string'
            ? o.receiverAddress
            : ''
      hostRaw = typeof o.host === 'string' ? o.host : ''
    } catch {
      /* use empty */
    }
  }

  const recv = parseReceiverAddressForResource(receiverRaw)
  if (!recv.ok) return badRequest(recv.message)
  const host = normalizeAllowlistHost(hostRaw)
  if (!host) return badRequest('host is required')

  const removed = await deleteAllowlistEntry(env.DB, recv.value, host)
  if (!removed) {
    return json(
      { ok: false, error: 'Entry not found', code: 'NOT_FOUND' },
      { status: 404 },
    )
  }
  return json({ ok: true, receiver_address: recv.value, host })
}
