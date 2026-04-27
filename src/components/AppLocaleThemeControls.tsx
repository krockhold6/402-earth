import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, IconButton } from "@coinbase/cds-web/buttons"
import { Dropdown, MenuItem } from "@coinbase/cds-web/dropdown"
import { useA11yControlledVisibility } from "@coinbase/cds-web/hooks/useA11yControlledVisibility"
import { Box, HStack, VStack } from "@coinbase/cds-web/layout"
import { TextCaption } from "@coinbase/cds-web/typography"
import { setAppLanguage } from "@/i18n/config"
import {
  type AppLocale,
  isAppLocale,
  SUPPORTED_LOCALES,
} from "@/i18n/locales"
import { useCdsColorScheme } from "@/providers/cdsColorSchemeContext"

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

export type AppLocaleThemeControlsProps = {
  /** Open the language menu toward the top when anchored in a bottom footer. */
  menuPlacement?: "top" | "bottom"
}

export function AppLocaleThemeControls({
  menuPlacement = "top",
}: AppLocaleThemeControlsProps) {
  const { t, i18n } = useTranslation()
  const { colorScheme, toggleColorScheme } = useCdsColorScheme()
  const [translatorOpen, setTranslatorOpen] = useState(false)

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

  const placement =
    menuPlacement === "top"
      ? ({ placement: "top-end" as const, gap: 1 as const })
      : ({ placement: "bottom-end" as const, gap: 1 as const })

  return (
    <HStack
      gap={2}
      alignItems="center"
      justifyContent="flex-end"
      flexWrap="wrap"
      width="100%"
      minWidth={0}
    >
      <Dropdown
        accessibilityLabel={t("nav.languageMenu")}
        content={translatorContent}
        contentPosition={placement}
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
        className="app-nav-theme-toggle"
        name={colorScheme === "light" ? "moon" : "light"}
        variant="secondary"
        type="button"
        accessibilityLabel={t("nav.menuTheme")}
        onClick={toggleColorScheme}
      />
    </HStack>
  )
}
