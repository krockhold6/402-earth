import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "react-router-dom"
import { Button, IconButton } from "@coinbase/cds-web/buttons"
import { Dropdown, MenuItem } from "@coinbase/cds-web/dropdown"
import { useA11yControlledVisibility } from "@coinbase/cds-web/hooks/useA11yControlledVisibility"
import { Icon } from "@coinbase/cds-web/icons"
import { Box, Grid, HStack, VStack } from "@coinbase/cds-web/layout"
import { PageHeader } from "@coinbase/cds-web/page/PageHeader"
import { TextCaption } from "@coinbase/cds-web/typography"
import type { IconName } from "@coinbase/cds-common/types"
import { setAppLanguage } from "@/i18n/config"
import {
  type AppLocale,
  isAppLocale,
  SUPPORTED_LOCALES,
} from "@/i18n/locales"
import { useCdsColorScheme } from "@/providers/cdsColorSchemeContext"

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

type AppMenuTileProps = {
  icon: IconName
  labelKey: string
  value: string
}

function AppMenuTile({ icon, labelKey, value }: AppMenuTileProps) {
  const { t } = useTranslation()
  const body = (
    <VStack gap={1} alignItems="center" width="100%" paddingY={1} paddingX={1}>
      <Icon name={icon} size="m" color="fg" />
      <TextCaption color="fgMuted" textAlign="center">
        {t(labelKey)}
      </TextCaption>
    </VStack>
  )

  return (
    <MenuItem value={value} borderRadius={300} width="100%">
      {body}
    </MenuItem>
  )
}

const APP_MENU_TILES: AppMenuTileProps[] = [
  { icon: "light", labelKey: "nav.menuTheme", value: "theme" },
  { icon: "compass", labelKey: "nav.menuHowItWorks", value: "how-it-works" },
  { icon: "documentation", labelKey: "nav.menuDocs", value: "docs" },
  { icon: "helpCenterQuestionMark", labelKey: "nav.menuHelp", value: "help" },
  { icon: "pulse", labelKey: "nav.menuStatus", value: "status" },
  { icon: "api", labelKey: "nav.menuApi", value: "api" },
]

/** Open in a new tab so the SPA never navigates away from the current window. */
const EXTERNAL_MENU_URLS: Record<string, string> = {
  docs: "https://402.earth",
  help: "https://402.earth",
  status: "https://402.earth",
  api: "https://402.earth",
}

/** Endonym labels for the language menu (not translated). */
const LANGUAGE_MENU_LABELS: Record<AppLocale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  pt: "Português",
  ja: "日本語",
  ko: "한국어",
  "zh-CN": "中文",
  ar: "العربية",
  hi: "हिन्दी",
  ru: "Русский",
  nl: "Nederlands",
  pl: "Polski",
  tr: "Türkçe",
  vi: "Tiếng Việt",
  id: "Bahasa Indonesia",
  th: "ไทย",
}

export function AppNavbar() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { toggleColorScheme } = useCdsColorScheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [translatorOpen, setTranslatorOpen] = useState(false)

  const resolved = i18n.resolvedLanguage
  const activeLangCode: AppLocale = isAppLocale(i18n.language)
    ? i18n.language
    : resolved && isAppLocale(resolved)
      ? resolved
      : "en"
  const activeLangLabel = LANGUAGE_MENU_LABELS[activeLangCode] ?? "English"

  const { triggerAccessibilityProps, controlledElementAccessibilityProps } =
    useA11yControlledVisibility(menuOpen, {
      accessibilityLabel: t("nav.appMenu"),
      hasPopupType: "menu",
    })

  const {
    triggerAccessibilityProps: translatorTriggerA11y,
    controlledElementAccessibilityProps: translatorControlledA11y,
  } = useA11yControlledVisibility(translatorOpen, {
    accessibilityLabel: t("nav.languageMenu"),
    hasPopupType: "menu",
  })

  const handleMenuChange = useCallback(
    (key: string) => {
      if (key === "theme") {
        toggleColorScheme()
        return
      }
      if (key === "how-it-works") {
        navigate("/how-it-works")
        return
      }
      const externalUrl = EXTERNAL_MENU_URLS[key]
      if (externalUrl) {
        window.open(externalUrl, "_blank", "noopener,noreferrer")
      }
    },
    [navigate, toggleColorScheme],
  )

  const translatorContent = useMemo(
    () => (
      <VStack gap={0} padding={2} width="100%" minWidth={200}>
        {SUPPORTED_LOCALES.map((code) => (
          <MenuItem key={code} value={code} borderRadius={300}>
            <TextCaption color="fg" paddingY={1} paddingX={2}>
              {LANGUAGE_MENU_LABELS[code]}
            </TextCaption>
          </MenuItem>
        ))}
      </VStack>
    ),
    [],
  )

  const handleTranslatorChange = useCallback(
    (key: string) => {
      if (!isAppLocale(key) || key === activeLangCode) return
      setAppLanguage(key)
    },
    [activeLangCode],
  )

  return (
    <PageHeader
      background="bg"
      borderedBottom
      position="sticky"
      top={0}
      zIndex={100}
      width="100%"
      start={
        <HStack gap={2} alignItems="center">
          <Box
            as={Link}
            to="/"
            display="inline-flex"
            alignItems="center"
            color="fg"
            accessibilityLabel={t("nav.homeAria")}
          >
            <EarthLogo />
          </Box>
          <Dropdown
            accessibilityLabel={t("nav.languageMenu")}
            content={translatorContent}
            contentPosition={{ placement: "bottom-start", gap: 1 }}
            controlledElementAccessibilityProps={translatorControlledA11y}
            maxHeight={320}
            minWidth={200}
            onChange={handleTranslatorChange}
            onCloseMenu={() => setTranslatorOpen(false)}
            onOpenMenu={() => setTranslatorOpen(true)}
          >
            <Box display="inline-flex" style={{ width: "auto" }}>
              <Button
                compact
                variant="secondary"
                background="bg"
                borderColor="fg"
                minWidth="auto"
                paddingX={3}
                type="button"
                startIcon="globe"
                accessibilityLabel={`${t("nav.languageMenu")}, ${activeLangLabel}`}
                {...translatorTriggerA11y}
              >
                {activeLangLabel}
              </Button>
            </Box>
          </Dropdown>
        </HStack>
      }
      end={
        <HStack gap={2} alignItems="center">
          <Button
            compact
            variant="secondary"
            background="bg"
            borderColor="fg"
            minWidth="auto"
            paddingX={3}
            type="button"
          >
            {t("nav.signUp")}
          </Button>
          <Button
            compact
            variant="secondary"
            minWidth="auto"
            paddingX={3}
            type="button"
          >
            {t("nav.signIn")}
          </Button>
          <Dropdown
            accessibilityLabel={t("nav.appMenu")}
            content={
              <Grid columns={3} gap={1} padding={2} width="100%">
                {APP_MENU_TILES.map((tile) => (
                  <AppMenuTile key={tile.value} {...tile} />
                ))}
              </Grid>
            }
            contentPosition={{ placement: "bottom-end", gap: 1 }}
            controlledElementAccessibilityProps={
              controlledElementAccessibilityProps
            }
            maxHeight={360}
            minWidth={280}
            onChange={handleMenuChange}
            onCloseMenu={() => setMenuOpen(false)}
            onOpenMenu={() => setMenuOpen(true)}
          >
            <Box display="inline-flex" style={{ width: "auto" }}>
              <IconButton
                name="appSwitcher"
                variant="secondary"
                accessibilityLabel={t("nav.openAppMenu")}
                {...triggerAccessibilityProps}
              />
            </Box>
          </Dropdown>
        </HStack>
      }
    />
  )
}
