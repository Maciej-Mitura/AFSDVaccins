import { createI18n } from 'vue-i18n'

import { loadLocaleWithFallback } from './locale-loader'
import { resolveInitialLocale } from './locale-resolution'
import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  type SupportedLocale,
} from './supported-locales'

/**
 * Resolve teacher-compatible flat dotted keys (`label.password.recovery`)
 * as literal map keys. Do not use `flatJson` — it cannot represent both
 * `label.password` and `label.password.recovery` without conflicts.
 */
export function flatKeyMessageResolver(
  obj: unknown,
  path: string,
): string | null {
  if (obj !== null && typeof obj === 'object' && path in obj) {
    const value = (obj as Record<string, unknown>)[path]
    return typeof value === 'string' ? value : null
  }
  return null
}

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

export function syncDocumentLang(locale: SupportedLocale): void {
  if (typeof document === 'undefined') {
    return
  }
  document.documentElement.lang = locale
}

/**
 * Resolve initial locale, load English + active catalogs, create i18n, sync lang.
 * Call once during bootstrap before `app.use(router)`.
 */
export async function bootstrapI18n(): Promise<AppI18n> {
  const initialLocale = resolveInitialLocale()
  const i18n = createAppI18n(initialLocale)
  const { active, fallback } = await loadLocaleWithFallback(initialLocale)

  if (fallback) {
    i18n.global.setLocaleMessage(FALLBACK_LOCALE, fallback)
  }
  i18n.global.setLocaleMessage(initialLocale, active)
  i18n.global.locale.value = initialLocale
  syncDocumentLang(initialLocale)

  return i18n
}

export {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  SUPPORTED_LOCALE_CODES,
  getLocaleBcp47,
  isSupportedLocale,
  type SupportedLocale,
} from './supported-locales'

export {
  LOCALE_STORAGE_KEY,
  detectBrowserLocale,
  normalizeLocale,
  persistLocale,
  readPersistedLocale,
  resolveInitialLocale,
} from './locale-resolution'

export {
  loadLocaleMessages,
  loadLocaleWithFallback,
  isLocaleLoaded,
  unwrapLocaleCatalog,
} from './locale-loader'
