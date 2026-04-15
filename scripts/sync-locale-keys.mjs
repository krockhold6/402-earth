/**
 * Ensures every src/locales/*.json (except en.json) contains all keys from en.json.
 * Missing keys are filled from English. Run after adding keys to en.json.
 *   node scripts/sync-locale-keys.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dir = path.join(__dirname, "../src/locales")
const en = JSON.parse(fs.readFileSync(path.join(dir, "en.json"), "utf8"))
const enKeys = Object.keys(en)

for (const name of fs.readdirSync(dir)) {
  if (!name.endsWith(".json") || name === "en.json") continue
  const p = path.join(dir, name)
  const cur = JSON.parse(fs.readFileSync(p, "utf8"))
  const out = { ...en }
  for (const k of enKeys) {
    if (typeof cur[k] === "string" && cur[k].length > 0) out[k] = cur[k]
  }
  fs.writeFileSync(p, JSON.stringify(out, null, 2) + "\n", "utf8")
  console.log("synced", name)
}
