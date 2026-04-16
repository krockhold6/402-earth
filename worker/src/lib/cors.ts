/**
 * Browser origins allowed to call the public API from the 402.earth SPA.
 * The worker reflects a matching `Origin` so cross-site fetches succeed.
 */
const EXACT_ORIGINS = new Set([
  'https://402.earth',
  'https://www.402.earth',
])

function isAllowedOrigin(origin: string): boolean {
  if (EXACT_ORIGINS.has(origin)) return true
  if (/^http:\/\/localhost:\d+$/.test(origin)) return true
  if (/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) return true
  return false
}

/** Value for `Access-Control-Allow-Origin` on this request. */
export function corsAllowOrigin(req: Request): string {
  const origin = req.headers.get('Origin')
  if (origin && isAllowedOrigin(origin)) return origin
  return 'https://402.earth'
}

/** Rebuild the response with CORS headers aligned to the request `Origin`. */
export function withCors(req: Request, res: Response): Response {
  const headers = new Headers(res.headers)
  headers.set('access-control-allow-origin', corsAllowOrigin(req))
  headers.set('access-control-allow-methods', 'GET, POST, OPTIONS')
  headers.set(
    'access-control-allow-headers',
    'content-type, x-402-client, payment-signature, payment-required',
  )
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  })
}
