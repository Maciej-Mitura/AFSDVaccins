import { createI18n } from 'vue-i18n'

import nlCatalog from '@/locales/nl.json'
import enCatalog from '@/locales/en.json'
import {
  createAppI18n,
  flatKeyMessageResolver,
  syncDocumentLang,
  type SupportedLocale,
} from '@/i18n'
import { unwrapLocaleCatalog } from '@/i18n/locale-loader'

/**
 * Install a ready i18n instance for component tests (Composition API + flat keys).
 */
export function createTestI18n(locale: SupportedLocale = 'nl') {
  const i18n = createAppI18n(locale)
  i18n.global.setLocaleMessage('nl', unwrapLocaleCatalog('nl', nlCatalog))
  i18n.global.setLocaleMessage('en', unwrapLocaleCatalog('en', enCatalog))
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
    },
  })
}
