/**
 * Tracks notification IDs already shown as toasts so reconnect/refetch
 * does not replay historical notifications as new toasts.
 */

const toastedNotificationIds = new Set<string>()

export type ToastableNotification = {
  id: string
  title: string
  body: string
  read: boolean
}

export type NotificationToastApi = {
  add: (toast: { title: string; description: string; color?: string }) => void
}

let toastApi: NotificationToastApi | null = null

/** Wire Nuxt UI useToast() once from App bootstrap (optional for tests). */
export function setNotificationToastApi(
  api: NotificationToastApi | null,
): void {
  toastApi = api
}

/**
 * Shows one top-right in-app toast for a newly received unread notification.
 * Idempotent per notification id for the session.
 */
export function showNotificationToastIfNew(
  notification: ToastableNotification,
): boolean {
  if (notification.read) {
    return false
  }

  if (toastedNotificationIds.has(notification.id)) {
    return false
  }

  toastedNotificationIds.add(notification.id)

  toastApi?.add({
    title: notification.title,
    description: notification.body,
    color: 'primary',
  })

  return true
}

/** Mark IDs as already toasted (e.g. after initial list load) without showing UI. */
export function markNotificationsSeenForToast(
  notifications: Array<{ id: string }>,
): void {
  for (const notification of notifications) {
    toastedNotificationIds.add(notification.id)
  }
}

export function clearNotificationToastState(): void {
  toastedNotificationIds.clear()
}

export function wasNotificationToasted(id: string): boolean {
  return toastedNotificationIds.has(id)
}
