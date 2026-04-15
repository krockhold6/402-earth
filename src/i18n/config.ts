import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import en from "@/locales/en.json"
import es from "@/locales/es.json"
import fr from "@/locales/fr.json"
import de from "@/locales/de.json"
import it from "@/locales/it.json"
import pt from "@/locales/pt.json"
import ja from "@/locales/ja.json"
import ko from "@/locales/ko.json"
import zhCN from "@/locales/zh-CN.json"
import ar from "@/locales/ar.json"
import hi from "@/locales/hi.json"
import ru from "@/locales/ru.json"
import nl from "@/locales/nl.json"
import pl from "@/locales/pl.json"
import tr from "@/locales/tr.json"
import vi from "@/locales/vi.json"
import id from "@/locales/id.json"
import th from "@/locales/th.json"
import {
  LOCALE_STORAGE_KEY,
  readStoredLocale,
  SUPPORTED_LOCALES,
  type AppLocale,
} from "@/i18n/locales"

type TranslationDict = Record<string, string>

const enFlat = en as TranslationDict

/** Merge so new English keys appear until each locale file is updated. */
function bundle(overrides: TranslationDict): TranslationDict {
  return { ...enFlat, ...overrides }
}

const translationsByLocale: Record<AppLocale, TranslationDict> = {
  en: enFlat,
  es: bundle(es as TranslationDict),
  fr: bundle(fr as TranslationDict),
  de: bundle(de as TranslationDict),
  it: bundle(it as TranslationDict),
  pt: bundle(pt as TranslationDict),
  ja: bundle(ja as TranslationDict),
  ko: bundle(ko as TranslationDict),
  "zh-CN": bundle(zhCN as TranslationDict),
  ar: bundle(ar as TranslationDict),
  hi: bundle(hi as TranslationDict),
  ru: bundle(ru as TranslationDict),
  nl: bundle(nl as TranslationDict),
  pl: bundle(pl as TranslationDict),
  tr: bundle(tr as TranslationDict),
  vi: bundle(vi as TranslationDict),
  id: bundle(id as TranslationDict),
  th: bundle(th as TranslationDict),
}

const resources = Object.fromEntries(
  SUPPORTED_LOCALES.map((lng) => [
    lng,
    { translation: translationsByLocale[lng] },
  ]),
) as Record<AppLocale, { translation: TranslationDict }>

void i18n.use(initReactI18next).init({
  resources,
  lng: readStoredLocale(),
  fallbackLng: "en",
  supportedLngs: [...SUPPORTED_LOCALES],
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
})

document.documentElement.lang = i18n.language || readStoredLocale()

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, lng)
  } catch {
    /* ignore */
  }
})

export function setAppLanguage(lng: AppLocale) {
  void i18n.changeLanguage(lng)
}

export default i18n
