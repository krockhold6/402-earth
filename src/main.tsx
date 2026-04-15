import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router-dom"

import "@/i18n/config"

import "@coinbase/cds-icons/fonts/web/icon-font.css"
import "@coinbase/cds-web/globalStyles"
import "@coinbase/cds-web/defaultFontStyles"

import { CdsAppShell } from "./providers/CdsAppShell"
import { RootErrorBoundary } from "./RootErrorBoundary"

import App from "./App"
import "./index.css"

const baseUrl =
  typeof import.meta.env.BASE_URL === "string"
    ? import.meta.env.BASE_URL
    : "/"
const routerBasename = baseUrl.replace(/\/$/, "") || undefined

const rootEl = document.getElementById("root")
if (!rootEl) {
  throw new Error('Missing #root element')
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <CdsAppShell>
      <BrowserRouter basename={routerBasename}>
        <RootErrorBoundary>
          <App />
        </RootErrorBoundary>
      </BrowserRouter>
    </CdsAppShell>
  </React.StrictMode>,
)
