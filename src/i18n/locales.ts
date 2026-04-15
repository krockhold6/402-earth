/** BCP 47 codes supported by the navbar language menu (native names stay in UI). */
export const SUPPORTED_LOCALES = [
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "ja",
  "ko",
  "zh-CN",
  "ar",
  "hi",
  "ru",
  "nl",
  "pl",
  "tr",
  "vi",
  "id",
  "th",
] as const

export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

export const LOCALE_STORAGE_KEY = "402earth.locale"

export function isAppLocale(value: string): value is AppLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

export function readStoredLocale(): AppLocale {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY)?.trim()
    if (raw && isAppLocale(raw)) return raw
  } catch {
    /* private mode */
  }
  return "en"
}
