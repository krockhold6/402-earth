export const ALLOWED_ORIGIN = 'https://402.earth'

function mergeJsonHeaders(init?: ResponseInit): Headers {
  const h = new Headers(init?.headers)
  if (!h.has('content-type')) {
    h.set('content-type', 'application/json; charset=utf-8')
  }
  h.set('access-control-allow-origin', ALLOWED_ORIGIN)
  h.set('access-control-allow-methods', 'GET, POST, OPTIONS')
  h.set('access-control-allow-headers', 'content-type, x-402-client')
  return h
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: mergeJsonHeaders(init),
  })
}

export function notFound(
  message = 'Not found',
  init: ResponseInit = {},
): Response {
  return json({ ok: false, error: message }, { ...init, status: 404 })
}

export function badRequest(
  message = 'Bad request',
  init: ResponseInit = {},
): Response {
  return json({ ok: false, error: message }, { ...init, status: 400 })
}
