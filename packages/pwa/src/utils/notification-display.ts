/**
 * Resolves notification title/body for the current locale.
 * Prefer titleKey/bodyKey + interpolationData; fall back to legacy title/body.
 * Never surfaces raw i18n keys or unresolved `{placeholder}` braces.
 */

export type NotificationInterpolationValues = Record<
  string,
  string | number | null | undefined
>

export type DisplayableNotification = {
  title: string
  body: string
  titleKey?: string | null
  bodyKey?: string | null
  interpolationData?: NotificationInterpolationValues | null
}

export type TranslateFn = (
  key: string,
  values?: Record<string, unknown>,
) => string

/** Optional string placeholders that must render as empty when absent. */
const OPTIONAL_EMPTY_KEYS = ['city'] as const

const FALLBACK_PHARMACY_KEY = 'notifications.fallback.pharmacyName'
const NEXT_STOP_BODY_KEY = 'notifications.apotheker.nextStop.body'
const NEXT_STOP_BODY_NO_CITY_KEY = 'notifications.apotheker.nextStop.bodyNoCity'

function looksUnresolved(translated: string, key: string): boolean {
  return !translated || translated === key || looksLikeI18nKey(translated)
}

function stripUnresolvedPlaceholders(text: string): string {
  return text
    .replace(/\{[a-zA-Z0-9_]+\}/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+\./g, '.')
    .replace(/\s+,/g, ',')
    .trim()
}

function scalarToDisplayString(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }
  return ''
}

function toTranslateValues(
  data: NotificationInterpolationValues | null | undefined,
  t: TranslateFn,
): Record<string, unknown> {
  const values: Record<string, unknown> = {}

  if (data != null) {
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) {
        continue
      }
      values[key] = value
    }
  }

  for (const key of OPTIONAL_EMPTY_KEYS) {
    if (values[key] == null || values[key] === '') {
      values[key] = ''
    }
  }

  const pharmacyName = scalarToDisplayString(values.pharmacyName).trim()
  if (!pharmacyName) {
    const fallback = t(FALLBACK_PHARMACY_KEY)
    values.pharmacyName = looksUnresolved(fallback, FALLBACK_PHARMACY_KEY)
      ? 'A pharmacy'
      : fallback
  }

  return values
}

/**
 * True when title/body look like mirrored i18n keys rather than human copy.
 * Phase 27A mirrored keys into title/body for legacy UI compatibility.
 */
export function looksLikeI18nKey(value: string | null | undefined): boolean {
  if (!value) {
    return false
  }

  return value.startsWith('notifications.')
}

function resolveKeyedText(
  key: string | null | undefined,
  mirrored: string,
  values: Record<string, unknown>,
  t: TranslateFn,
): string {
  const resolvedKey = key || (looksLikeI18nKey(mirrored) ? mirrored : null)

  if (resolvedKey) {
    const translated = t(resolvedKey, values)
    if (!looksUnresolved(translated, resolvedKey)) {
      return stripUnresolvedPlaceholders(translated)
    }
  }

  if (mirrored && !looksLikeI18nKey(mirrored)) {
    return stripUnresolvedPlaceholders(
      mirrored.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, k: string) => {
        return scalarToDisplayString(values[k])
      }),
    )
  }

  return 'Notification'
}

export function resolveNotificationTitle(
  notification: DisplayableNotification,
  t: TranslateFn,
): string {
  const values = toTranslateValues(notification.interpolationData, t)
  return resolveKeyedText(notification.titleKey, notification.title, values, t)
}

export function resolveNotificationBody(
  notification: DisplayableNotification,
  t: TranslateFn,
): string {
  const values = toTranslateValues(notification.interpolationData, t)
  let bodyKey = notification.bodyKey ?? null

  if (
    bodyKey === NEXT_STOP_BODY_KEY &&
    !scalarToDisplayString(values.city).trim()
  ) {
    bodyKey = NEXT_STOP_BODY_NO_CITY_KEY
  }

  return resolveKeyedText(bodyKey, notification.body, values, t)
}

export function resolveNotificationCopy(
  notification: DisplayableNotification,
  t: TranslateFn,
): { title: string; body: string } {
  return {
    title: resolveNotificationTitle(notification, t),
    body: resolveNotificationBody(notification, t),
  }
}
