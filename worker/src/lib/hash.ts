/** SHA-256 of a UTF-8 string, lowercase hex (for storing signature fingerprints). */
export async function sha256HexUtf8(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  )
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
