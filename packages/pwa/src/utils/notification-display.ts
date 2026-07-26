/**
 * Resolves notification title/body for the current locale.
 * Prefer titleKey/bodyKey + interpolationData; fall back to legacy title/body.
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

function toTranslateValues(
  data: NotificationInterpolationValues | null | undefined,
): Record<string, unknown> | undefined {
  if (data == null) {
    return undefined
  }

  const values: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      continue
    }
    values[key] = value
  }

  return Object.keys(values).length > 0 ? values : undefined
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

export function resolveNotificationTitle(
  notification: DisplayableNotification,
  t: TranslateFn,
): string {
  if (notification.titleKey) {
    return t(
      notification.titleKey,
      toTranslateValues(notification.interpolationData),
    )
  }

  if (looksLikeI18nKey(notification.title)) {
    return t(
      notification.title,
      toTranslateValues(notification.interpolationData),
    )
  }

  return notification.title
}

export function resolveNotificationBody(
  notification: DisplayableNotification,
  t: TranslateFn,
): string {
  if (notification.bodyKey) {
    return t(
      notification.bodyKey,
      toTranslateValues(notification.interpolationData),
    )
  }

  if (looksLikeI18nKey(notification.body)) {
    return t(
      notification.body,
      toTranslateValues(notification.interpolationData),
    )
  }

  return notification.body
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
