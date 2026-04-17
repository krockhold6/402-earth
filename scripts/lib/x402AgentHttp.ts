/**
 * Shared HTTP helpers for dev/agent x402 scripts (GET pay URL, create attempt, poll attempt).
 */

export async function readBodyPreview(
  res: Response,
): Promise<{ text: string; json: unknown | null }> {
  const text = await res.text()
  try {
    return { text, json: JSON.parse(text) as unknown }
  } catch {
    return { text, json: null }
  }
}

export function payUrl(
  origin: string,
  slug: string,
  attemptId: string | null,
): string {
  const base = `${origin.replace(/\/$/, '')}/x402/pay/${encodeURIComponent(slug)}`
  if (!attemptId) return base
  return `${base}?attemptId=${encodeURIComponent(attemptId)}`
}

export async function postPaymentAttempt(
  origin: string,
  slug: string,
): Promise<{ attemptId: string; raw: unknown }> {
  const url = `${origin.replace(/\/$/, '')}/api/payment-attempt`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, clientType: 'agent' }),
  })
  const { text, json } = await readBodyPreview(res)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from POST /api/payment-attempt\n${text}`)
  }
  const rec =
    json && typeof json === 'object' && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : null
  const id = rec && typeof rec.attemptId === 'string' ? rec.attemptId.trim() : ''
  if (!id) {
    throw new Error(`Create attempt response missing attemptId: ${text}`)
  }
  return { attemptId: id, raw: json }
}

export async function fetchPaymentAttempt(
  origin: string,
  id: string,
): Promise<{ status: number; json: unknown | null; text: string }> {
  const url = `${origin.replace(/\/$/, '')}/api/payment-attempt/${encodeURIComponent(id)}`
  const res = await fetch(url)
  const { text, json } = await readBodyPreview(res)
  return { status: res.status, json, text }
}
