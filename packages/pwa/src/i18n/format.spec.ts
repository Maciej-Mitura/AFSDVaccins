/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetAppI18nForTests,
  formatDate,
  formatDateTime,
  formatNumber,
  getLocaleBcp47,
} from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'
import { useLanguage } from '@/composables/useLanguage'

const FIXED = '2024-06-15T12:00:00.000Z'

describe('locale-aware formatters', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('nl')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('passes BCP47 tags from getLocaleBcp47 into Intl formatters', async () => {
    const dateSpy = vi.spyOn(Intl, 'DateTimeFormat')
    const numberSpy = vi.spyOn(Intl, 'NumberFormat')
    const { setLocale } = useLanguage()

    formatDate(FIXED)
    expect(dateSpy).toHaveBeenCalledWith(
      getLocaleBcp47('nl'),
      expect.objectContaining({ dateStyle: 'medium' }),
    )

    formatDateTime(FIXED)
    expect(dateSpy).toHaveBeenCalledWith(
      getLocaleBcp47('nl'),
      expect.objectContaining({ dateStyle: 'short', timeStyle: 'short' }),
    )

    formatNumber(1234.5)
    expect(numberSpy).toHaveBeenCalledWith(getLocaleBcp47('nl'), undefined)

    await setLocale('en')
    dateSpy.mockClear()
    numberSpy.mockClear()

    formatDate(FIXED)
    expect(dateSpy).toHaveBeenCalledWith(
      getLocaleBcp47('en'),
      expect.objectContaining({ dateStyle: 'medium' }),
    )
    formatDateTime(FIXED)
    expect(dateSpy).toHaveBeenCalledWith(
      getLocaleBcp47('en'),
      expect.objectContaining({ dateStyle: 'short', timeStyle: 'short' }),
    )
    formatNumber(1234.5)
    expect(numberSpy).toHaveBeenCalledWith(getLocaleBcp47('en'), undefined)

    expect(getLocaleBcp47('nl')).toBe('nl-BE')
    expect(getLocaleBcp47('en')).toBe('en-GB')
  })

  it('changes number output when locale switches (nl vs en)', async () => {
    const nl = formatNumber(1234.5)
    const { setLocale } = useLanguage()
    await setLocale('en')
    const en = formatNumber(1234.5)
    expect(nl).not.toBe(en)
  })
})
