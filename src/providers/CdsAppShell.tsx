import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { MediaQueryProvider, ThemeProvider } from "@coinbase/cds-web/system"
import { defaultTheme } from "@coinbase/cds-web/themes/defaultTheme"

export type CdsColorScheme = "light" | "dark"

type CdsColorSchemeContextValue = {
  colorScheme: CdsColorScheme
  setColorScheme: (scheme: CdsColorScheme) => void
  toggleColorScheme: () => void
}

const CdsColorSchemeContext = createContext<CdsColorSchemeContextValue | null>(
  null,
)

function getPreferredColorScheme(): CdsColorScheme {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

export function useCdsColorScheme() {
  const ctx = useContext(CdsColorSchemeContext)
  if (!ctx) {
    throw new Error("useCdsColorScheme must be used within CdsAppShell")
  }
  return ctx
}

export function CdsAppShell({ children }: { children: ReactNode }) {
  const [activeColorScheme, setActiveColorScheme] = useState<CdsColorScheme>(
    getPreferredColorScheme,
  )

  const toggleColorScheme = useCallback(() => {
    setActiveColorScheme((s) => (s === "light" ? "dark" : "light"))
  }, [])

  const value = useMemo(
    () => ({
      colorScheme: activeColorScheme,
      setColorScheme: setActiveColorScheme,
      toggleColorScheme,
    }),
    [activeColorScheme, toggleColorScheme],
  )

  return (
    <MediaQueryProvider>
      <ThemeProvider theme={defaultTheme} activeColorScheme={activeColorScheme}>
        <CdsColorSchemeContext.Provider value={value}>
          {children}
        </CdsColorSchemeContext.Provider>
      </ThemeProvider>
    </MediaQueryProvider>
  )
}
