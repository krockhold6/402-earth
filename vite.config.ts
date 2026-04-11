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
      name: "github-pages-spa-fallback",
      closeBundle() {
        const indexHtml = path.resolve(__dirname, "dist/index.html")
        if (base !== "/" && existsSync(indexHtml)) {
          copyFileSync(indexHtml, path.resolve(__dirname, "dist/404.html"))
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
