import { createContext, useContext } from "react"

export type CdsColorScheme = "light" | "dark"

export type CdsColorSchemeContextValue = {
  colorScheme: CdsColorScheme
  setColorScheme: (scheme: CdsColorScheme) => void
  toggleColorScheme: () => void
}

export const CdsColorSchemeContext =
  createContext<CdsColorSchemeContextValue | null>(null)

export function useCdsColorScheme() {
  const ctx = useContext(CdsColorSchemeContext)
  if (!ctx) {
    throw new Error("useCdsColorScheme must be used within CdsAppShell")
  }
  return ctx
}
