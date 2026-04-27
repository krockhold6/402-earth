import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useLocation } from "react-router-dom"
import { Button, IconButton } from "@coinbase/cds-web/buttons"
import { Dropdown, MenuItem } from "@coinbase/cds-web/dropdown"
import { useA11yControlledVisibility } from "@coinbase/cds-web/hooks/useA11yControlledVisibility"
import { useMediaQuery } from "@coinbase/cds-web/hooks/useMediaQuery"
import { Box, HStack, VStack } from "@coinbase/cds-web/layout"
import { Tray } from "@coinbase/cds-web/overlays"
import { PageHeader } from "@coinbase/cds-web/page/PageHeader"
import { TextCaption } from "@coinbase/cds-web/typography"
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
      viewBox="0 0 91 39"
      fill="none"
      width={74}
      height={32}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M67 31.0352L78.5862 19.993C80.7282 17.9554 82.1724 16.4108 82.9189 15.3592C83.6653 14.3075 84.0385 13.1901 84.0385 12.007C84.0385 10.7582 83.6166 9.72301 82.7728 8.90141C81.929 8.07981 80.8418 7.66901 79.5112 7.66901H79.0243C77.5314 7.66901 76.2982 8.1784 75.3245 9.19718C74.3509 10.1831 73.8479 11.5469 73.8154 13.2887H67.3408C67.3408 10.9883 67.8438 8.98357 68.8499 7.27465C69.8884 5.56573 71.3002 4.26761 73.0852 3.38028C74.9026 2.46009 76.9473 2 79.2191 2C81.4584 2 83.4219 2.42723 85.1095 3.28169C86.8296 4.10329 88.1602 5.25352 89.1014 6.7324C90.0426 8.21127 90.5132 9.88733 90.5132 11.7606C90.5132 13.8639 90.0264 15.7371 89.0527 17.3803C88.0791 18.9906 86.4077 20.8967 84.0385 23.0986L75.1785 31.331H91V37H67V31.0352Z"
      />
      <path
        fill="currentColor"
        d="M16.6035 29.8543H0V23.3043L16.407 1.95435H22.8421V24.1043H28V29.8543H22.8421V36.9543H16.6035V29.8543ZM16.6035 24.1043V10.8543L6.38597 24.1043H16.6035Z"
      />
      <path
        fill="#1F51F6"
        stroke="#1F51F6"
        strokeWidth={4}
        d="M58.6646 8.33613C64.83 14.502 64.8296 24.4988 58.6639 30.6645C52.4981 36.8299 42.5019 36.8299 36.3361 30.6645C30.1704 24.4988 30.17 14.502 36.3354 8.33613C42.5013 2.1703 52.4987 2.1703 58.6646 8.33613Z"
      />
    </svg>
  )
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

const MOBILE_NAV_MAX = "(max-width: 959px)"

export function AppNavbar() {
  const { t, i18n } = useTranslation()
  const { pathname } = useLocation()
  const isHome = pathname === "/"
  const isCompactNav = useMediaQuery(MOBILE_NAV_MAX)
  const { colorScheme, toggleColorScheme } = useCdsColorScheme()
  const [translatorOpen, setTranslatorOpen] = useState(false)
  const [appMenuOpen, setAppMenuOpen] = useState(false)

  const resolved = i18n.resolvedLanguage
  const activeLangCode: AppLocale = isAppLocale(i18n.language)
    ? i18n.language
    : resolved && isAppLocale(resolved)
      ? resolved
      : "en"
  const activeLangLabel = LANGUAGE_MENU_LABELS[activeLangCode] ?? "English"

  const {
    triggerAccessibilityProps: translatorTriggerA11y,
    controlledElementAccessibilityProps: translatorControlledA11y,
  } = useA11yControlledVisibility(translatorOpen, {
    accessibilityLabel: t("nav.languageMenu"),
    hasPopupType: "menu",
  })

  const {
    triggerAccessibilityProps: appMenuTriggerA11y,
    controlledElementAccessibilityProps: appMenuControlledA11y,
  } = useA11yControlledVisibility(appMenuOpen, {
    accessibilityLabel: t("nav.openAppMenu"),
    hasPopupType: "dialog",
  })

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

  const navEnd =
    isHome ? undefined : isCompactNav ? (
      <>
        <HStack gap={2} alignItems="center">
          <Dropdown
            accessibilityLabel={t("nav.languageMenu")}
            content={translatorContent}
            contentPosition={{ placement: "bottom-end", gap: 1 }}
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
                borderRadius={500}
                minWidth="auto"
                paddingX={3}
                type="button"
                endIcon="caretDown"
                accessibilityLabel={`${t("nav.languageMenu")}, ${activeLangLabel}`}
                {...translatorTriggerA11y}
              >
                {activeLangLabel}
              </Button>
            </Box>
          </Dropdown>
          <Box display="inline-flex">
            <IconButton
              name="appSwitcher"
              variant="secondary"
              type="button"
              accessibilityLabel={t("nav.openAppMenu")}
              {...appMenuTriggerA11y}
              onClick={() => setAppMenuOpen(true)}
            />
          </Box>
        </HStack>
        {appMenuOpen ? (
          <Tray
            accessibilityLabel={t("nav.appMenu")}
            id={appMenuControlledA11y.id}
            pin="right"
            title={t("nav.appMenu")}
            onCloseComplete={() => setAppMenuOpen(false)}
          >
            {({ handleClose }) => (
              <VStack
                gap={2}
                paddingX={3}
                paddingY={2}
                width="100%"
                alignItems="stretch"
              >
                <Button
                  className="app-nav-theme-toggle"
                  variant="secondary"
                  type="button"
                  width="100%"
                  startIcon={colorScheme === "light" ? "moon" : "light"}
                  onClick={() => {
                    toggleColorScheme()
                    handleClose()
                  }}
                >
                  {colorScheme === "light"
                    ? t("nav.themeSwitchToDark")
                    : t("nav.themeSwitchToLight")}
                </Button>
              </VStack>
            )}
          </Tray>
        ) : null}
      </>
    ) : (
      <HStack gap={2} alignItems="center">
        <Dropdown
          accessibilityLabel={t("nav.languageMenu")}
          content={translatorContent}
          contentPosition={{ placement: "bottom-end", gap: 1 }}
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
              borderRadius={500}
              minWidth="auto"
              paddingX={3}
              type="button"
              endIcon="caretDown"
              accessibilityLabel={`${t("nav.languageMenu")}, ${activeLangLabel}`}
              {...translatorTriggerA11y}
            >
              {activeLangLabel}
            </Button>
          </Box>
        </Dropdown>
        <IconButton
          name={colorScheme === "light" ? "moon" : "light"}
          variant="secondary"
          type="button"
          accessibilityLabel={t("nav.menuTheme")}
          onClick={toggleColorScheme}
        />
      </HStack>
    )

  return (
    <PageHeader
      background="bg"
      borderedBottom
      position="sticky"
      top={0}
      zIndex={10000}
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
        </HStack>
      }
      end={navEnd}
    />
  )
}
