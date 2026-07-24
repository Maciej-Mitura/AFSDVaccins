import { createI18n } from 'vue-i18n'

import nlCatalog from '@/locales/nl.json'
import enCatalog from '@/locales/en.json'
import esCatalog from '@/locales/es.json'
import zhCatalog from '@/locales/zh.json'
import {
  createAppI18n,
  flatKeyMessageResolver,
  syncDocumentLang,
  type SupportedLocale,
} from '@/i18n'
import { unwrapLocaleCatalog } from '@/i18n/locale-loader'

const CATALOGS = {
  nl: nlCatalog,
  en: enCatalog,
  es: esCatalog,
  zh: zhCatalog,
} as const

/**
 * Install a ready i18n instance for component tests (Composition API + flat keys).
 * Loads all four locale catalogs so setLocale / status labels can switch freely.
 */
export function createTestI18n(locale: SupportedLocale = 'nl') {
  const i18n = createAppI18n(locale)
  for (const code of Object.keys(CATALOGS) as SupportedLocale[]) {
    i18n.global.setLocaleMessage(
      code,
      unwrapLocaleCatalog(code, CATALOGS[code]),
    )
  }
  i18n.global.locale.value = locale
  syncDocumentLang(locale)
  return i18n
}

/** Lightweight i18n without bootstrap side effects (for pure message checks). */
export function createPlainI18n(locale: SupportedLocale = 'nl') {
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'en',
    messageResolver: flatKeyMessageResolver,
    messages: {
      nl: unwrapLocaleCatalog('nl', nlCatalog),
      en: unwrapLocaleCatalog('en', enCatalog),
      es: unwrapLocaleCatalog('es', esCatalog),
      zh: unwrapLocaleCatalog('zh', zhCatalog),
    },
  })
}
