import { SignJWT, importJWK, importPKCS8 } from 'jose'

function randomHex(bytes: number): string {
  const u = new Uint8Array(bytes)
  crypto.getRandomValues(u)
  return [...u].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function toBase64Url(data: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < data.length; i++) bin += String.fromCharCode(data[i]!)
  const b64 = btoa(bin)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * CDP REST JWT (Bearer) for Coinbase Business APIs.
 * Supports ES256 PEM (PKCS#8) or Ed25519 64-byte base64 secret (32-byte seed + 32-byte public key).
 */
export async function generateCdpBearerJwt(options: {
  apiKeyId: string
  apiKeySecret: string
  requestMethod: string
  requestHost: string
  requestPath: string
  expiresInSeconds?: number
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const exp = options.expiresInSeconds ?? 120
  const uri = `${options.requestMethod} ${options.requestHost}${options.requestPath}`
  const claims = {
    sub: options.apiKeyId,
    iss: 'cdp',
    uris: [uri],
  }

  const secret = options.apiKeySecret.trim()
  try {
    const ecKey = await importPKCS8(secret, 'ES256')
    return await new SignJWT(claims)
      .setProtectedHeader({
        alg: 'ES256',
        kid: options.apiKeyId,
        typ: 'JWT',
        nonce: randomHex(16),
      })
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(now + exp)
      .sign(ecKey)
  } catch {
    // Ed25519: Coinbase sometimes issues 64-byte base64 (seed || pub)
    let raw: Uint8Array
    try {
      raw = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0))
    } catch {
      throw new Error(
        'COINBASE_CDP_API_KEY_SECRET must be ES256 PKCS#8 PEM or Ed25519 64-byte base64',
      )
    }
    if (raw.length !== 64) {
      throw new Error(
        'COINBASE_CDP_API_KEY_SECRET must be ES256 PKCS#8 PEM or Ed25519 64-byte base64',
      )
    }
    const seed = raw.subarray(0, 32)
    const pub = raw.subarray(32, 64)
    const jwk = {
      kty: 'OKP',
      crv: 'Ed25519',
      d: toBase64Url(seed),
      x: toBase64Url(pub),
    }
    const edKey = await importJWK(jwk, 'EdDSA')
    return await new SignJWT(claims)
      .setProtectedHeader({
        alg: 'EdDSA',
        kid: options.apiKeyId,
        typ: 'JWT',
        nonce: randomHex(16),
      })
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(now + exp)
      .sign(edKey)
  }
}
