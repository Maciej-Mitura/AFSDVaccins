/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'

import { useLanguage } from '@/composables/useLanguage'
import { __resetAppI18nForTests, LOCALE_STORAGE_KEY } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

describe('useLanguage (selector backing API)', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    localStorage.clear()
    document.documentElement.lang = 'nl'
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    localStorage.clear()
  })

  it('setLocale switches catalog, persists choice, and updates document lang', async () => {
    const i18n = createTestI18n('nl')
    const Host = defineComponent({
      setup() {
        return useLanguage()
      },
      template: '<div />',
    })
    mount(Host, { global: { plugins: [i18n] } })

    const { setLocale, currentLocale, supportedLocales } = useLanguage()
    expect(supportedLocales.nl.label).toBe('Nederlands')
    expect(supportedLocales.en.label).toBe('English')

    await setLocale('es')
    expect(currentLocale.value).toBe('es')
    expect(i18n.global.t('auth.login.title')).toBe('Iniciar sesión')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('es')
    expect(document.documentElement.lang).toBe('es')
  })
})
