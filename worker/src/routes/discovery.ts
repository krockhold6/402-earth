import apiCatalogLinkset from '../well-known-api-catalog.generated.json'
import openApiSpec from '../openapi.generated.json'

const LINKSET_TYPE =
  'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"'

/**
 * Well-known and discovery routes for `api.402.earth` (and local dev).
 * Returns `null` when this module does not handle the request.
 */
export function tryDiscoveryRoutes(req: Request): Response | null {
  const url = new URL(req.url)
  const { pathname } = url
  const method = req.method

  if (pathname === '/health' && (method === 'GET' || method === 'HEAD')) {
    const body = method === 'HEAD' ? null : JSON.stringify({ ok: true })
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }

  if (pathname === '/openapi.json' && (method === 'GET' || method === 'HEAD')) {
    const body = method === 'HEAD' ? null : JSON.stringify(openApiSpec)
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }

  if (pathname === '/.well-known/api-catalog' && (method === 'GET' || method === 'HEAD')) {
    const body = method === 'HEAD' ? null : JSON.stringify(apiCatalogLinkset)
    const headers = new Headers()
    headers.set('content-type', LINKSET_TYPE)
    headers.set(
      'link',
      `<${url.origin}/.well-known/api-catalog>; rel="api-catalog"`,
    )
    return new Response(body, { status: 200, headers })
  }

  return null
}
