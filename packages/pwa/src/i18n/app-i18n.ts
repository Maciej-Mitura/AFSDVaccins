import { createI18n } from 'vue-i18n'

import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  type SupportedLocale,
} from './supported-locales'
import { flatKeyMessageResolver } from './message-resolver'

function buildI18n(initialLocale: SupportedLocale) {
  return createI18n({
    legacy: false,
    locale: initialLocale,
    fallbackLocale: FALLBACK_LOCALE,
    messages: {},
    messageResolver: flatKeyMessageResolver,
    missingWarn: import.meta.env.DEV,
    fallbackWarn: import.meta.env.DEV,
    globalInjection: false,
  })
}

export type AppI18n = ReturnType<typeof buildI18n>

let i18nInstance: AppI18n | null = null

/**
 * Composition API mode. Messages stay as flat Record<string, string>
 * matching exporter JSON wrappers after unwrap.
 */
export function createAppI18n(
  initialLocale: SupportedLocale = DEFAULT_LOCALE,
): AppI18n {
  const i18n = buildI18n(initialLocale)
  i18nInstance = i18n
  return i18n
}

export function getAppI18n(): AppI18n {
  if (!i18nInstance) {
    throw new Error('i18n has not been created yet. Call createAppI18n first.')
  }
  return i18nInstance
}

export function __resetAppI18nForTests(): void {
  i18nInstance = null
}
