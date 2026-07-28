import type { Notification } from './notification.entity'
import type { NotificationInterpolationData } from './notification-taxonomy'

/**
 * English fallback templates for OS push payloads.
 * In-app UI resolves titleKey/bodyKey via the PWA locale catalogs;
 * the service worker has no locale, so push must ship human-readable copy.
 * Keep placeholders aligned with PWA `en.json` notification keys.
 */
export const NOTIFICATION_COPY_EN: Readonly<Record<string, string>> = {
  'notifications.admin.newOrder.title': 'New order received',
  'notifications.admin.newOrder.body':
    '{pharmacyName} placed an order for delivery on {routeDate} ({orderCount} products).',
  'notifications.apotheker.routeStarted.title': 'Courier started your delivery',
  'notifications.apotheker.routeStarted.body':
    'Your delivery for {pharmacyName} on {routeDate} is on the way.',
  'notifications.apotheker.nextStop.title': "You're next on the delivery route",
  'notifications.apotheker.nextStop.body':
    'Prepare for delivery on {routeDate}. The courier is coming from {city}.',
  'notifications.apotheker.nextStop.bodyNoCity':
    'Prepare for your delivery on {routeDate}.',
  'notifications.apotheker.deliveryConfirmed.title': 'Delivery confirmed',
  'notifications.apotheker.deliveryConfirmed.body':
    'Delivery to {pharmacyName} on {routeDate} was confirmed ({orderCount} orders).',
  'notifications.bezorger.routeAssigned.title':
    'A new route has been assigned to you',
  'notifications.bezorger.routeAssigned.body':
    'Route for {stopCount} pharmacies is scheduled for {routeDate}.',
  'notifications.bezorger.routeDateReminder.title': 'Route reminder',
  'notifications.bezorger.routeDateReminder.body':
    'You have a route today ({routeDate}) with {stopCount} stops.',
  'notifications.apotheker.orderConfirmation.title': 'Order placed',
  'notifications.apotheker.orderConfirmation.body':
    'Your order for {doseCount} doses will be delivered on {routeDate}.',
  'notifications.apotheker.weekLimitWarning.title': 'Weekly limit warning',
  'notifications.apotheker.weekLimitWarning.body':
    'You have reached {warningPercentage}% of your weekly maximum ({weeklyDoseCap} doses).',
  'notifications.apotheker.orderCancelled.title': 'Order cancelled',
  'notifications.apotheker.orderCancelled.body':
    'Your order for delivery on {routeDate} has been cancelled.',
  'notifications.apotheker.orderCancelledByAdmin.body':
    'Your order for delivery on {routeDate} was cancelled by an administrator.',
  'notifications.apotheker.orderDelivered.title': 'Order delivered',
  'notifications.apotheker.orderDelivered.body':
    'Your order was delivered on {routeDate}.',
  'notifications.admin.lowStock.title': 'Low stock',
  'notifications.admin.lowStock.body':
    '{vaccineName} has {quantityRemaining} doses left (warning at {stockThreshold}).',
  'notifications.fallback.pharmacyName': 'A pharmacy',
  'notifications.fallback.city': '',
}

const PLACEHOLDER_RE = /\{([a-zA-Z0-9_]+)\}/g

export function interpolateNotificationTemplate(
  template: string,
  data: Record<string, string | number | null | undefined> | null | undefined,
): string {
  const values = data ?? {}
  return template
    .replace(PLACEHOLDER_RE, (_match, key: string) => {
      const value = values[key]
      if (value === null || value === undefined) {
        return ''
      }
      return String(value)
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+\./g, '.')
    .trim()
}

function interpolationRecord(
  notification: Pick<Notification, 'interpolationData'>,
): Record<string, string | number | null | undefined> {
  const data = notification.interpolationData as
    | NotificationInterpolationData
    | null
    | undefined
  if (!data) {
    return {}
  }
  return { ...data }
}

/**
 * Resolves human-readable English title/body for push (and any consumer
 * that cannot run PWA i18n). Prefer titleKey/bodyKey; never return raw keys.
 */
export function resolveEnglishNotificationCopy(
  notification: Pick<
    Notification,
    'title' | 'body' | 'titleKey' | 'bodyKey' | 'interpolationData'
  >,
): { title: string; body: string } {
  const values = interpolationRecord(notification)
  if (!values.pharmacyName) {
    values.pharmacyName =
      NOTIFICATION_COPY_EN['notifications.fallback.pharmacyName']
  }

  let bodyKey = notification.bodyKey ?? null
  if (
    bodyKey === 'notifications.apotheker.nextStop.body' &&
    !String(values.city ?? '').trim()
  ) {
    bodyKey = 'notifications.apotheker.nextStop.bodyNoCity'
  }

  const titleKey = notification.titleKey
  const titleTemplate =
    (titleKey && NOTIFICATION_COPY_EN[titleKey]) ||
    (notification.title && !notification.title.startsWith('notifications.')
      ? notification.title
      : null) ||
    (titleKey ? NOTIFICATION_COPY_EN[titleKey] : null)

  const bodyTemplate =
    (bodyKey && NOTIFICATION_COPY_EN[bodyKey]) ||
    (notification.body && !notification.body.startsWith('notifications.')
      ? notification.body
      : null) ||
    (bodyKey ? NOTIFICATION_COPY_EN[bodyKey] : null)

  const title = titleTemplate
    ? interpolateNotificationTemplate(titleTemplate, values)
    : 'Notification'
  const body = bodyTemplate
    ? interpolateNotificationTemplate(bodyTemplate, values)
    : ''

  return { title, body }
}
