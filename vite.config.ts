import { copyFileSync, existsSync } from "fs"
import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Default `/` so script/CSS URLs are always `/assets/…` on apex (402.earth). A relative
// base (`./`) breaks any non-root path: e.g. `/pay/x` resolves `./assets/index.js` to
// `/pay/assets/…` (404 HTML → MIME error → stuck on index.html "Loading…").
//
// GitHub **project** Pages (`…/github.io/<repo>/`) needs `VITE_BASE_PATH=/<repo>/`
// (set in `.github/workflows/deploy-pages.yml`). Override with VITE_BASE_PATH or
// VITE_PUBLIC_BASE when needed.
function normalizeViteBase(raw: string): string {
  const t = raw.trim()
  if (t === "" || t === "/") return "/"
  if (t === "." || t === "./") return "./"
  const withSlash = t.endsWith("/") ? t : `${t}/`
  return withSlash.startsWith("/") ? withSlash : `/${withSlash}`
}

const rawBase =
  process.env.VITE_BASE_PATH ?? process.env.VITE_PUBLIC_BASE ?? "/"
const base = normalizeViteBase(rawBase)

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    {
      name: "spa-fallback-404-html",
      apply: "build",
      enforce: "post",
      closeBundle() {
        const indexHtml = path.resolve(__dirname, "dist/index.html")
        const notFoundHtml = path.resolve(__dirname, "dist/404.html")
        // Copy shell for deep links / hard refresh on static hosts (GitHub Pages,
        // Cloudflare Pages). Prefer this over a catch-all `_redirects` rule: Cloudflare
        // applies those redirects even when a static file would match, which can
        // rewrite `/assets/*.js` to `index.html` and break ES modules (MIME error).
        if (existsSync(indexHtml)) {
          copyFileSync(indexHtml, notFoundHtml)
        }
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/x402": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    // If 4173 is taken, fail loudly instead of moving to 4174 (easy to open the wrong URL).
    strictPort: true,
    host: true,
  },
})