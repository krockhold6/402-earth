import { getResourceBySlug } from '../db/resources'
import { buyerUnlockPageUrl } from '../lib/siteUrl'
import { sendCreatorReceiptEmail } from '../lib/creatorReceiptEmail'
import { badRequest, json } from '../lib/response'
import type { Env } from '../types/env'

/** Lenient RFC-like check — receipt flow is best-effort; Worker still validates resource exists. */
const EMAIL_RE =
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

export async function handlePostResourceEmailReceipt(
  env: Env,
  slug: string,
  req: Request,
): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('Invalid JSON body')
  }

  const emailRaw =
    typeof (body as { email?: unknown }).email === 'string'
      ? (body as { email: string }).email.trim()
      : ''

  if (!emailRaw || emailRaw.length > 320 || !EMAIL_RE.test(emailRaw)) {
    return badRequest('Valid email is required')
  }

  const resource = await getResourceBySlug(env.DB, slug)
  if (!resource || !resource.active) {
    return json({ ok: false, error: 'Resource not found' }, { status: 404 })
  }

  const unlockUrl = buyerUnlockPageUrl(env, resource.slug)

  try {
    await sendCreatorReceiptEmail(env, {
      to: emailRaw,
      unlockUrl,
      resource,
    })
    return json({ ok: true })
  } catch {
    return json(
      { ok: false, error: 'Could not send receipt' },
      { status: 502 },
    )
  }
}
