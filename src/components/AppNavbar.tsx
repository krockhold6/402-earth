import { Link } from "react-router-dom"
import { IconButton } from "@coinbase/cds-web/buttons"
import { Box } from "@coinbase/cds-web/layout"
import { PageHeader } from "@coinbase/cds-web/page/PageHeader"
import { useCdsColorScheme } from "@/providers/CdsAppShell"

function EarthLogo() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 91 36"
      fill="none"
      width={74}
      height={29}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="m67 29.08 11.586-11.04c2.142-2.038 3.586-3.583 4.333-4.634.746-1.052 1.12-2.17 1.12-3.352 0-1.25-.422-2.284-1.266-3.106-.844-.822-1.931-1.232-3.262-1.232h-.487c-1.493 0-2.726.51-3.7 1.528-.973.986-1.476 2.35-1.509 4.091h-6.474c0-2.3.503-4.305 1.509-6.014a10.149 10.149 0 0 1 4.235-3.894c1.818-.92 3.862-1.38 6.134-1.38 2.24 0 4.203.427 5.89 1.281 1.72.822 3.051 1.972 3.992 3.451.942 1.479 1.412 3.155 1.412 5.028 0 2.104-.487 3.977-1.46 5.62-.974 1.61-2.645 3.516-5.014 5.718l-8.86 8.233H91v5.669H67V29.08ZM16.604 27.9H0v-6.55L16.407 0h6.435v22.15H28v5.75h-5.158V35h-6.238v-7.1Zm0-5.75V8.9L6.386 22.15h10.218Zm14.351-10.606c3.61-9.137 13.944-13.617 23.081-10.007 9.137 3.61 13.617 13.944 10.007 23.081-3.61 9.137-13.943 13.617-23.08 10.007-9.137-3.61-13.618-13.944-10.008-23.081ZM54.482 22.99c-1.388 2.957-3.134 5.479-5 7.259a13.226 13.226 0 0 1-2.063 1.623c4.881.027 9.534-2.557 12.034-6.918l-4.97-1.964Zm-11.71-4.627c-.826 2.632-1.152 5.082-1.044 7.02.145 2.58.968 3.476 1.44 3.662.472.186 1.683.095 3.553-1.69 1.404-1.34 2.84-3.352 4.035-5.838l-7.984-3.154Zm-8.697-3.436c-1.156 4.89.474 9.957 4.054 13.273a13.219 13.219 0 0 1-.395-2.593c-.144-2.574.303-5.61 1.31-8.716l-4.969-1.964ZM56.868 7.96c.222.846.348 1.73.397 2.595.144 2.574-.305 5.609-1.313 8.715l4.97 1.964c1.156-4.891-.473-9.958-4.054-13.274Zm-5.036-.843c-.471-.186-1.684-.095-3.555 1.69-1.403 1.34-2.84 3.35-4.035 5.835l7.984 3.156c.826-2.631 1.153-5.081 1.044-7.019-.145-2.58-.966-3.475-1.438-3.662ZM47.576 4.29c-4.88-.026-9.531 2.558-12.031 6.917l4.97 1.964c1.388-2.956 3.136-5.478 5.002-7.258a13.223 13.223 0 0 1 2.06-1.623Z"
      />
    </svg>
  )
}

export function AppNavbar() {
  const { colorScheme, toggleColorScheme } = useCdsColorScheme()

  return (
    <PageHeader
      background="bg"
      borderedBottom
      position="sticky"
      top={0}
      zIndex={100}
      width="100%"
      start={
        <Box
          as={Link}
          to="/"
          display="inline-flex"
          color="fg"
          accessibilityLabel="402.earth home"
        >
          <EarthLogo />
        </Box>
      }
      end={
        <IconButton
          name={colorScheme === "light" ? "moon" : "sun"}
          variant="secondary"
          onClick={toggleColorScheme}
          accessibilityLabel={
            colorScheme === "light"
              ? "Switch to dark theme"
              : "Switch to light theme"
          }
        />
      }
    />
  )
}
