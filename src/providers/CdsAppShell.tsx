import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { Box } from "@coinbase/cds-web/layout"
import { MediaQueryProvider, ThemeProvider } from "@coinbase/cds-web/system"
import { defaultTheme } from "@coinbase/cds-web/themes/defaultTheme"
import {
  CdsColorSchemeContext,
  type CdsColorScheme,
} from "./cdsColorSchemeContext"

function getPreferredColorScheme(): CdsColorScheme {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
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

  useEffect(() => {
    const bg =
      activeColorScheme === "dark"
        ? defaultTheme.darkColor.bg
        : defaultTheme.lightColor.bg
    document.documentElement.style.backgroundColor = bg
    document.body.style.backgroundColor = bg
  }, [activeColorScheme])

  return (
    <MediaQueryProvider>
      <ThemeProvider
        theme={defaultTheme}
        activeColorScheme={activeColorScheme}
        display="flex"
        style={{
          flex: "1 1 0%",
          flexDirection: "column",
          minHeight: 0,
          height: "100%",
          overflow: "hidden",
          backgroundColor: "var(--color-bg)",
        }}
      >
        <CdsColorSchemeContext.Provider value={value}>
          <Box
            display="flex"
            flexDirection="column"
            width="100%"
            style={{ flex: "1 1 0%", minHeight: 0 }}
          >
            {children}
          </Box>
        </CdsColorSchemeContext.Provider>
      </ThemeProvider>
    </MediaQueryProvider>
  )
}
