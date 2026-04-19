import { tryConsumeUnlockToken } from '../db/unlockTokens'
import { json } from '../lib/response'
import { nowIso } from '../lib/time'
import type { Env } from '../types/env'

export async function handleGetUnlock(env: Env, token: string): Promise<Response> {
  const t = token.trim()
  if (!t) {
    return json({ ok: false, error: 'Token required' }, { status: 404 })
  }

  const now = nowIso()
  const outcome = await tryConsumeUnlockToken(env.DB, t, now)

  if (outcome.kind === 'consumed') {
    return new Response(null, {
      status: 302,
      headers: {
        location: outcome.redirectUrl,
      },
    })
  }
  if (outcome.kind === 'not_found') {
    return json({ ok: false, error: 'Not found' }, { status: 404 })
  }
  return json(
    { ok: false, error: 'This access link is no longer valid' },
    { status: 410 },
  )
}
