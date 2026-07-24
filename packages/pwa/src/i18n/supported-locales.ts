/**
 * Central locale metadata for the PWA runtime.
 * Do not duplicate this list in components — import from here.
 */

export const SUPPORTED_LOCALES = {
  nl: {
    code: 'nl',
    label: 'Nederlands',
    /** BCP 47 tag for Intl date/number formatting (Phase 23B representative screens). */
    bcp47: 'nl-BE',
  },
  en: {
    code: 'en',
    label: 'English',
    bcp47: 'en-GB',
  },
  zh: {
    code: 'zh',
    label: '中文',
    bcp47: 'zh-CN',
  },
  es: {
    code: 'es',
    label: 'Español',
    bcp47: 'es-ES',
  },
} as const

export type SupportedLocale = keyof typeof SUPPORTED_LOCALES

export const DEFAULT_LOCALE: SupportedLocale = 'nl'
export const FALLBACK_LOCALE: SupportedLocale = 'en'

export const SUPPORTED_LOCALE_CODES = Object.keys(
  SUPPORTED_LOCALES,
) as SupportedLocale[]

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(SUPPORTED_LOCALES, value)
  )
}

export function getLocaleBcp47(locale: SupportedLocale): string {
  return SUPPORTED_LOCALES[locale].bcp47
}
