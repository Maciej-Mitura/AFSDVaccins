import { getAppI18n } from './app-i18n'

/**
 * Translate with the active app i18n instance.
 * Safe for composables/mappers outside of setup() as long as bootstrap completed.
 */
export function translate(
  key: string,
  values?: Record<string, unknown>,
): string {
  const i18n = getAppI18n()
  if (values) {
    return String(i18n.global.t(key, values))
  }
  return String(i18n.global.t(key))
}

/**
 * Plural-aware translate for pipe messages (`one | other`).
 * Passes `count` both as the plural choice and a named interpolation.
 */
export function translatePlural(
  key: string,
  count: number,
  values?: Record<string, unknown>,
): string {
  const i18n = getAppI18n()
  return String(
    i18n.global.t(key, count, { count, ...values } as Record<string, unknown>),
  )
}
