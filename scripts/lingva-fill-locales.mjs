/**
 * Fills locale JSON via public Lingva (no npm dep). Preserves {{…}} and XML-like tags.
 * Usage: node scripts/lingva-fill-locales.mjs ko ar hi ru id th
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const enPath = path.join(root, "src/locales/en.json")

const LINGVA = "https://lingva.ml/api/v1/en"

function protect(s) {
  const vault = []
  let n = 0
  const stash = (m) => {
    vault.push(m)
    return `\u2060${n++}\u2060`
  }
  let t = s
  t = t.replace(/<([a-zA-Z][a-zA-Z0-9]*)>[\s\S]*?<\/\1>/g, stash)
  t = t.replace(/\{\{[^}]+\}\}/g, stash)
  return { t, vault }
}

function unvault(s, vault) {
  return s.replace(/\u2060(\d+)\u2060/g, (_, i) => vault[Number(i)] ?? "")
}

async function translateViaLingva(text, lingvaTo) {
  const { t, vault } = protect(text)
  const enc = encodeURIComponent(t).replace(/'/g, "%27")
  const url = `${LINGVA}/${lingvaTo}/${enc}`
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  if (typeof data.translation !== "string") {
    throw new Error(JSON.stringify(data).slice(0, 200))
  }
  return unvault(data.translation, vault)
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

const en = JSON.parse(fs.readFileSync(enPath, "utf8"))
const keys = Object.keys(en).sort()

const targets = process.argv.slice(2)
if (targets.length === 0) {
  console.error("usage: node scripts/lingva-fill-locales.mjs ko ar hi ru id th")
  process.exit(1)
}

for (const code of targets) {
  const out = {}
  let i = 0
  for (const key of keys) {
    const src = en[key]
    process.stdout.write(`\r${code} ${i + 1}/${keys.length} ${key.slice(0, 36)}`)
    let attempt = 0
    let lastErr = null
    while (attempt < 4) {
      try {
        out[key] = await translateViaLingva(src, code)
        lastErr = null
        break
      } catch (e) {
        lastErr = e
        attempt++
        await sleep(800 * attempt)
      }
    }
    if (lastErr) {
      console.error(`\n${code} ${key}: ${lastErr.message}`)
      out[key] = src
    }
    await sleep(320)
    i++
  }
  const name = code === "zh-CN" ? "zh-CN.json" : `${code}.json`
  fs.writeFileSync(
    path.join(root, "src/locales", name),
    JSON.stringify(out, null, 2) + "\n",
    "utf8",
  )
  console.log(`\nwrote ${name}`)
}
