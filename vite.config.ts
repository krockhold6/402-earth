import { copyFileSync, existsSync } from "fs"
import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// GitHub project Pages URL is /<repo>/; set VITE_BASE_PATH in CI (e.g. /402-earth/).
const rawBase = process.env.VITE_BASE_PATH ?? "/"
const base =
  rawBase === "/" ? "/" : rawBase.endsWith("/") ? rawBase : `${rawBase}/`

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
})