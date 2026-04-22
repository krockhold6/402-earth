import { verifyMessage } from 'viem'
import { SignJWT, jwtVerify } from 'jose'
import type { Env } from '../types/env'

function jwtSecretBytes(env: Env): Uint8Array | null {
  const s = env.CAPABILITY_SELLER_JWT_SECRET?.trim()
  if (!s) return null
  return new TextEncoder().encode(s)
}

export async function issueSellerJwt(
  env: Env,
  walletAddressLower: string,
): Promise<string | null> {
  const key = jwtSecretBytes(env)
  if (!key) return null
  return new SignJWT({ scope: 'capability_seller' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(walletAddressLower)
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(key)
}

export async function verifySellerJwt(
  env: Env,
  token: string,
): Promise<string | null> {
  const key = jwtSecretBytes(env)
  if (!key) return null
  try {
    const { payload } = await jwtVerify(token, key)
    const sub = payload.sub
    if (typeof sub !== 'string' || !/^0x[a-f0-9]{40}$/i.test(sub)) return null
    return sub.toLowerCase()
  } catch {
    return null
  }
}

export async function verifyWalletSignature(input: {
  wallet: string
  message: string
  signature: `0x${string}`
}): Promise<boolean> {
  const ok = await verifyMessage({
    address: input.wallet as `0x${string}`,
    message: input.message,
    signature: input.signature,
  }).catch(() => false)
  return ok
}

export function sellerJwtNotConfiguredResponse(): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: 'Seller session is not configured',
      code: 'SELLER_JWT_NOT_CONFIGURED',
    }),
    { status: 503, headers: { 'content-type': 'application/json' } },
  )
}
