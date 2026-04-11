import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router-dom"

import "@coinbase/cds-icons/fonts/web/icon-font.css"
import "@coinbase/cds-web/defaultFontStyles"
import "@coinbase/cds-web/globalStyles"

import { CdsAppShell } from "./providers/CdsAppShell"

import App from "./App"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CdsAppShell>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </CdsAppShell>
  </React.StrictMode>,
)
