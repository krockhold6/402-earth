/**
 * Suggested MCP tool / resource name from a human-readable capability name:
 * lowercased, word separators become underscores, alphanumerics + underscores only.
 * Falls back to a light transform if the string has no Latin digits/letters.
 */
export function mcpNameFromCapabilityName(raw: string): string {
  const t = raw.trim()
  if (t.length === 0) return ""
  const ascii = t
    .toLowerCase()
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
  if (ascii.length > 0) {
    return ascii.length <= 200 ? ascii : ascii.slice(0, 200)
  }
  return t
    .toLowerCase()
    .replace(/[\s\-–—]+/g, "_")
    .slice(0, 200)
}
