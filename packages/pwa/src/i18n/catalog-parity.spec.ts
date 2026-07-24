/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'

import nlCatalog from '@/locales/nl.json'
import enCatalog from '@/locales/en.json'
import esCatalog from '@/locales/es.json'
import zhCatalog from '@/locales/zh.json'
import { unwrapLocaleCatalog } from '@/i18n/locale-loader'
import type { SupportedLocale } from '@/i18n'

const LOCALES: SupportedLocale[] = ['nl', 'en', 'es', 'zh']

const catalogs: Record<SupportedLocale, Record<string, string>> = {
  nl: unwrapLocaleCatalog('nl', nlCatalog),
  en: unwrapLocaleCatalog('en', enCatalog),
  es: unwrapLocaleCatalog('es', esCatalog),
  zh: unwrapLocaleCatalog('zh', zhCatalog),
}

function placeholderMultiset(value: string): string[] {
  return [...(value.match(/\{[^}]+\}/g) ?? [])].sort()
}

describe('locale catalog parity', () => {
  it('has identical key sets across all four locales', () => {
    const keySets = LOCALES.map(locale => Object.keys(catalogs[locale]).sort())
    const [nlKeys, ...rest] = keySets
    expect(nlKeys.length).toBeGreaterThan(0)
    for (const keys of rest) {
      expect(keys).toEqual(nlKeys)
    }
  })

  it('has no blank effective values', () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(catalogs[locale])) {
        expect(value.trim(), `${locale}:${key}`).not.toBe('')
      }
    }
  })

  it('matches placeholder token multisets across locales for each key', () => {
    const keys = Object.keys(catalogs.nl)
    for (const key of keys) {
      const expected = placeholderMultiset(catalogs.nl[key])
      for (const locale of LOCALES) {
        expect(
          placeholderMultiset(catalogs[locale][key]),
          `${locale}:${key}`,
        ).toEqual(expected)
      }
    }
  })
})
