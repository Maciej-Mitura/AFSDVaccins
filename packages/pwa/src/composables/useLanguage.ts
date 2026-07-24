import { computed, ref, type ComputedRef, type Ref } from 'vue'

import {
  FALLBACK_LOCALE,
  getAppI18n,
  isSupportedLocale,
  loadLocaleWithFallback,
  normalizeLocale,
  persistLocale,
  SUPPORTED_LOCALE_CODES,
  SUPPORTED_LOCALES,
  syncDocumentLang,
  type SupportedLocale,
} from '@/i18n'

const loading = ref(false)
const error = ref<string | null>(null)

export type UseLanguageResult = {
  currentLocale: ComputedRef<SupportedLocale>
  supportedLocales: typeof SUPPORTED_LOCALES
  supportedLocaleCodes: readonly SupportedLocale[]
  loading: Ref<boolean>
  error: Ref<string | null>
  setLocale: (locale: string) => Promise<void>
  isLocaleSupported: (value: unknown) => value is SupportedLocale
  normalizeLocale: typeof normalizeLocale
}

/**
 * Shared language API — do not create independent locale state per component.
 */
export function useLanguage(): UseLanguageResult {
  const i18n = getAppI18n()

  const currentLocale = computed(
    () => i18n.global.locale.value as SupportedLocale,
  )

  async function setLocale(target: string): Promise<void> {
    if (!isSupportedLocale(target)) {
      error.value = `Unsupported locale: ${target}`
      throw new Error(error.value)
    }

    if (i18n.global.locale.value === target && !error.value) {
      syncDocumentLang(target)
      persistLocale(target)
      return
    }

    loading.value = true
    error.value = null

    try {
      const { active, fallback } = await loadLocaleWithFallback(target)

      if (fallback) {
        i18n.global.setLocaleMessage(FALLBACK_LOCALE, fallback)
      }
      i18n.global.setLocaleMessage(target, active)
      i18n.global.locale.value = target
      persistLocale(target)
      syncDocumentLang(target)
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : `Failed to set locale ${target}`
      throw err instanceof Error ? err : new Error(error.value)
    } finally {
      loading.value = false
    }
  }

  return {
    currentLocale,
    supportedLocales: SUPPORTED_LOCALES,
    supportedLocaleCodes: SUPPORTED_LOCALE_CODES,
    loading,
    error,
    setLocale,
    isLocaleSupported: isSupportedLocale,
    normalizeLocale,
  }
}
