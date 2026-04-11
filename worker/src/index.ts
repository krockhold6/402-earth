export interface Env {}

const ALLOWED_ORIGIN = 'https://402.earth'

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': ALLOWED_ORIGIN,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      ...(init.headers || {}),
    },
  })
}

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': ALLOWED_ORIGIN,
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
        },
      })
    }

    if (req.method === 'POST' && url.pathname === '/api/payment-session') {
      const body = (await req.json().catch(() => null)) as
        | { slug?: string; amount?: string; label?: string }
        | null

      const slug = body?.slug?.trim()
      const label = body?.label?.trim() || 'Payment'
      const amountNum = Number(body?.amount)

      if (!slug || Number.isNaN(amountNum) || amountNum <= 0) {
        return json(
          { ok: false, error: 'Invalid payment request' },
          { status: 400 },
        )
      }

      const amount = amountNum.toFixed(2)
      const receipt =
        `402-${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Date.now()
          .toString(36)
          .slice(-6)
          .toUpperCase()}`
      const paidAt = new Date().toISOString()

      const params = new URLSearchParams({
        amount,
        label,
        receipt,
        paidAt,
        status: 'paid',
      })

      return json({
        ok: true,
        sessionId: `sess_${crypto.randomUUID()}`,
        checkoutUrl: `/success/${slug}?${params.toString()}`,
      })
    }

    return json({ ok: false, error: 'Not found' }, { status: 404 })
  },
}
