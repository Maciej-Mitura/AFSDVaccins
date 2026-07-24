/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  __resetAppI18nForTests,
  createAppI18n,
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  SUPPORTED_LOCALE_CODES,
  detectBrowserLocale,
  getLocaleBcp47,
  isSupportedLocale,
  normalizeLocale,
  persistLocale,
  readPersistedLocale,
  resolveInitialLocale,
  syncDocumentLang,
} from '@/i18n'
import {
  __resetLocaleLoaderForTests,
  isLocaleLoaded,
  loadLocaleMessages,
  loadLocaleWithFallback,
  unwrapLocaleCatalog,
} from '@/i18n/locale-loader'
import { useLanguage } from '@/composables/useLanguage'

describe('supported locale configuration', () => {
  it('exposes nl, en, zh, es with human-readable labels', () => {
    expect(SUPPORTED_LOCALE_CODES).toEqual(['nl', 'en', 'zh', 'es'])
    expect(SUPPORTED_LOCALES.nl.label).toBe('Nederlands')
    expect(SUPPORTED_LOCALES.en.label).toBe('English')
    expect(SUPPORTED_LOCALES.zh.label).toBe('中文')
    expect(SUPPORTED_LOCALES.es.label).toBe('Español')
    expect(DEFAULT_LOCALE).toBe('nl')
    expect(FALLBACK_LOCALE).toBe('en')
  })

  it('maps locales to BCP 47 tags for formatting', () => {
    expect(getLocaleBcp47('nl')).toBe('nl-BE')
    expect(getLocaleBcp47('en')).toBe('en-GB')
    expect(getLocaleBcp47('es')).toBe('es-ES')
    expect(getLocaleBcp47('zh')).toBe('zh-CN')
  })
})

describe('browser locale normalization', () => {
  it.each([
    ['nl-BE', 'nl'],
    ['nl-NL', 'nl'],
    ['en-US', 'en'],
    ['en-GB', 'en'],
    ['es-ES', 'es'],
    ['es-MX', 'es'],
    ['zh-CN', 'zh'],
    ['zh-TW', 'zh'],
    ['zh-Hans', 'zh'],
    ['zh-Hant', 'zh'],
    ['NL', 'nl'],
    ['  en_US  ', 'en'],
  ])('normalizes %s → %s', (input, expected) => {
    expect(normalizeLocale(input)).toBe(expected)
  })

  it('returns null for unsupported tags', () => {
    expect(normalizeLocale('fr-FR')).toBeNull()
    expect(normalizeLocale('')).toBeNull()
    expect(normalizeLocale(null)).toBeNull()
  })

  it('prefers navigator.languages then navigator.language', () => {
    expect(detectBrowserLocale(['fr-FR', 'es-MX'], 'de')).toBe('es')
    expect(detectBrowserLocale(['fr-FR'], 'zh-TW')).toBe('zh')
    expect(detectBrowserLocale(['fr-FR'], 'de-DE')).toBeNull()
  })
})

describe('locale resolution priority', () => {
  const storage = new Map<string, string>()
  const fakeStorage: Storage = {
    get length() {
      return storage.size
    },
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    key: () => null,
    removeItem: (key: string) => {
      storage.delete(key)
    },
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
  }

  beforeEach(() => {
    storage.clear()
  })

  it('prefers persisted choice over browser', () => {
    persistLocale('es', fakeStorage)
    expect(
      resolveInitialLocale({
        storage: fakeStorage,
        languages: ['en-US'],
        language: 'en-US',
      }),
    ).toBe('es')
  })

  it('uses browser when nothing persisted', () => {
    expect(
      resolveInitialLocale({
        storage: fakeStorage,
        languages: ['zh-CN'],
        language: 'zh-CN',
      }),
    ).toBe('zh')
  })

  it('falls back to nl when unsupported', () => {
    expect(
      resolveInitialLocale({
        storage: fakeStorage,
        languages: ['fr-FR'],
        language: 'de',
      }),
    ).toBe('nl')
  })

  it('ignores unsupported persisted values', () => {
    fakeStorage.setItem(LOCALE_STORAGE_KEY, 'fr')
    expect(readPersistedLocale(fakeStorage)).toBeNull()
  })
})

describe('locale loader', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
  })

  it('loads catalogs once and validates wrappers', async () => {
    const first = await loadLocaleMessages('nl')
    expect(first['app.title']).toBe('Vaccinatie-levering')
    expect(isLocaleLoaded('nl')).toBe(true)

    const second = await loadLocaleMessages('nl')
    expect(second).toBe(first)
  })

  it('rejects wrapper mismatch', () => {
    expect(() => unwrapLocaleCatalog('nl', { en: { a: 'b' } })).toThrow(
      /wrapper mismatch/,
    )
  })

  it('loads English fallback with the active locale', async () => {
    const { active, fallback } = await loadLocaleWithFallback('es')
    expect(active['auth.login.title']).toBe('Iniciar sesión')
    expect(fallback?.['auth.login.title']).toBe('Sign in')
    expect(isLocaleLoaded('en')).toBe(true)
    expect(isLocaleLoaded('es')).toBe(true)
  })
})

describe('useLanguage setLocale', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    localStorage.clear()
    createAppI18n('nl')
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    localStorage.clear()
  })

  it('persists preference and updates document lang without reload', async () => {
    const { setLocale, currentLocale } = useLanguage()
    document.documentElement.lang = 'nl'

    await setLocale('en')

    expect(currentLocale.value).toBe('en')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })

  it('rejects unsupported locales', async () => {
    const { setLocale } = useLanguage()
    await expect(setLocale('fr')).rejects.toThrow(/Unsupported locale/)
  })

  it('ensures English fallback messages are available', async () => {
    const i18n = createAppI18n('nl')
    const { setLocale } = useLanguage()
    await setLocale('zh')
    expect(i18n.global.te('auth.login.title', 'en')).toBe(true)
    expect(i18n.global.t('auth.login.title')).toBeTruthy()
  })
})

describe('syncDocumentLang', () => {
  it('sets documentElement.lang', () => {
    syncDocumentLang('es')
    expect(document.documentElement.lang).toBe('es')
  })
})

describe('isSupportedLocale', () => {
  it('type-guards known codes', () => {
    expect(isSupportedLocale('nl')).toBe(true)
    expect(isSupportedLocale('fr')).toBe(false)
  })
})
