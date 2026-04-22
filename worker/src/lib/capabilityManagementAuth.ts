import type { Env } from '../types/env'

/** Bearer secret for allowlist CRUD and ops metrics (set in production). */
export function capabilityManagementAuthorized(
  env: Env,
  req: Request,
): boolean {
  const secret = env.CAPABILITY_MANAGEMENT_SECRET?.trim()
  if (!secret) return false
  const auth = req.headers.get('authorization')?.trim()
  return auth === `Bearer ${secret}`
}

export function managementNotConfiguredResponse(): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: 'Capability management is not configured',
      code: 'CAPABILITY_MANAGEMENT_DISABLED',
    }),
    {
      status: 503,
      headers: { 'content-type': 'application/json' },
    },
  )
}

export function managementUnauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )
}
