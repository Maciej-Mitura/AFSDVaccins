import { getAppI18n } from './app-i18n'
import { getLocaleBcp47, type SupportedLocale } from './supported-locales'

function currentLocale(): SupportedLocale {
  return getAppI18n().global.locale.value as SupportedLocale
}

function bcp47(): string {
  return getLocaleBcp47(currentLocale())
}

/**
 * Locale-aware date-time formatting using the active UI locale BCP47 tag.
 * Does not alter API/storage formats.
 */
export function formatDateTime(
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return new Intl.DateTimeFormat(
    bcp47(),
    options ?? { dateStyle: 'short', timeStyle: 'short' },
  ).format(date)
}

export function formatDate(
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return new Intl.DateTimeFormat(
    bcp47(),
    options ?? { dateStyle: 'medium' },
  ).format(date)
}

export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(bcp47(), options).format(value)
}
