import type { SupportedLocale } from './supported-locales'
import { FALLBACK_LOCALE, isSupportedLocale } from './supported-locales'

export type LocaleMessages = Record<string, string>

type LocaleModule = Record<string, unknown>

const messageCache = new Map<SupportedLocale, LocaleMessages>()
const loadingPromises = new Map<SupportedLocale, Promise<LocaleMessages>>()

const localeImporters: Record<
  SupportedLocale,
  () => Promise<{ default: LocaleModule }>
> = {
  nl: () => import('../locales/nl.json'),
  en: () => import('../locales/en.json'),
  zh: () => import('../locales/zh.json'),
  es: () => import('../locales/es.json'),
}

/**
 * Unwrap teacher-compatible `{ "nl": { "key": "value" } }` and validate
 * the wrapper key matches the requested locale.
 */
export function unwrapLocaleCatalog(
  locale: SupportedLocale,
  module: LocaleModule,
): LocaleMessages {
  const wrapper = module[locale]
  if (
    wrapper == null ||
    typeof wrapper !== 'object' ||
    Array.isArray(wrapper)
  ) {
    throw new Error(
      `Locale catalog wrapper mismatch: expected top-level key "${locale}".`,
    )
  }

  const messages: LocaleMessages = {}
  for (const [key, value] of Object.entries(
    wrapper as Record<string, unknown>,
  )) {
    if (typeof value === 'string') {
      messages[key] = value
    }
  }

  return messages
}

export function isLocaleLoaded(locale: SupportedLocale): boolean {
  return messageCache.has(locale)
}

export function getCachedLocaleMessages(
  locale: SupportedLocale,
): LocaleMessages | undefined {
  return messageCache.get(locale)
}

export function __resetLocaleLoaderForTests(): void {
  messageCache.clear()
  loadingPromises.clear()
}

/**
 * Dynamically import a generated locale JSON once per session.
 * Does not call Google Sheets — catalogs are Vite-bundled static assets.
 */
export async function loadLocaleMessages(
  locale: SupportedLocale,
): Promise<LocaleMessages> {
  if (!isSupportedLocale(locale)) {
    throw new Error(`Unsupported locale: ${String(locale)}`)
  }

  const cached = messageCache.get(locale)
  if (cached) {
    return cached
  }

  const inFlight = loadingPromises.get(locale)
  if (inFlight) {
    return inFlight
  }

  const promise = (async (): Promise<LocaleMessages> => {
    try {
      const mod = await localeImporters[locale]()
      const messages = unwrapLocaleCatalog(locale, mod.default)
      messageCache.set(locale, messages)
      return messages
    } catch (error) {
      messageCache.delete(locale)
      if (
        error instanceof Error &&
        error.message.includes('wrapper mismatch')
      ) {
        throw error
      }
      throw new Error(
        `Failed to load locale "${locale}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    } finally {
      loadingPromises.delete(locale)
    }
  })()

  loadingPromises.set(locale, promise)
  return promise
}

/**
 * Ensure English fallback is available, then load the active locale.
 */
export async function loadLocaleWithFallback(
  locale: SupportedLocale,
): Promise<{ active: LocaleMessages; fallback: LocaleMessages | null }> {
  let fallback: LocaleMessages | null = null

  try {
    fallback = await loadLocaleMessages(FALLBACK_LOCALE)
  } catch {
    fallback = null
  }

  if (locale === FALLBACK_LOCALE) {
    if (!fallback) {
      throw new Error('Failed to load English fallback locale catalog.')
    }
    return { active: fallback, fallback }
  }

  const active = await loadLocaleMessages(locale)
  return { active, fallback }
}
