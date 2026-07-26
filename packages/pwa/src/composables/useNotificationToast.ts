/**
 * Tracks notification IDs (and optional eventIds) already shown as toasts so
 * reconnect/refetch does not replay historical notifications as new toasts.
 *
 * Session-only in-memory state — never persist notification payloads.
 */

import { sanitizeInternalActionPath } from '@/utils/notification-action-path'

const toastedNotificationIds = new Set<string>()
const toastedEventIds = new Set<string>()

/** Subscription boundary: only events observed after this mark may toast. */
let sessionSubscriptionStartedAtMs = 0

export type ToastableNotification = {
  id: string
  eventId?: string | null
  title: string
  body: string
  read: boolean
  actionPath?: string | null
  createdAt?: string | Date | null
}

export type NotificationToastAction = {
  label: string
  onClick?: (event?: Event) => void
  click?: (event?: Event) => void
}

export type NotificationToastApi = {
  add: (toast: {
    title: string
    description: string
    color?: string
    /** Nuxt UI toaster position override when supported. */
    position?: string
    actions?: NotificationToastAction[]
  }) => void
}

let toastApi: NotificationToastApi | null = null
let navigateHandler: ((path: string) => void) | null = null
let openDetailsLabel = 'Open details'

/** Wire Nuxt UI useToast() once from App bootstrap (optional for tests). */
export function setNotificationToastApi(
  api: NotificationToastApi | null,
): void {
  toastApi = api
}

export function setNotificationToastNavigate(
  handler: ((path: string) => void) | null,
): void {
  navigateHandler = handler
}

export function setNotificationToastOpenLabel(label: string): void {
  openDetailsLabel = label
}

/** Call when the authenticated realtime subscription starts. */
export function markNotificationToastSubscriptionBoundary(
  nowMs: number = Date.now(),
): void {
  sessionSubscriptionStartedAtMs = nowMs
}

function isOlderThanSubscriptionBoundary(
  notification: ToastableNotification,
): boolean {
  if (!sessionSubscriptionStartedAtMs || !notification.createdAt) {
    return false
  }

  const createdMs =
    typeof notification.createdAt === 'string' ||
    notification.createdAt instanceof Date
      ? new Date(notification.createdAt).getTime()
      : Number.NaN

  if (!Number.isFinite(createdMs)) {
    return false
  }

  // Allow a small clock skew window for server-created timestamps.
  return createdMs < sessionSubscriptionStartedAtMs - 5_000
}

/**
 * Shows one top-right in-app toast for a newly received unread notification.
 * Idempotent per notification id / eventId for the session.
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

  if (notification.eventId && toastedEventIds.has(notification.eventId)) {
    return false
  }

  if (isOlderThanSubscriptionBoundary(notification)) {
    toastedNotificationIds.add(notification.id)
    if (notification.eventId) {
      toastedEventIds.add(notification.eventId)
    }
    return false
  }

  toastedNotificationIds.add(notification.id)
  if (notification.eventId) {
    toastedEventIds.add(notification.eventId)
  }

  const safePath = sanitizeInternalActionPath(notification.actionPath)
  const actions: NotificationToastAction[] | undefined = safePath
    ? [
        {
          label: openDetailsLabel,
          onClick: () => {
            navigateHandler?.(safePath)
          },
        },
      ]
    : undefined

  toastApi?.add({
    title: notification.title,
    description: notification.body,
    color: 'primary',
    position: 'top-right',
    actions,
  })

  return true
}

/** Mark IDs as already toasted (e.g. after initial list load) without showing UI. */
export function markNotificationsSeenForToast(
  notifications: Array<{ id: string; eventId?: string | null }>,
): void {
  for (const notification of notifications) {
    toastedNotificationIds.add(notification.id)
    if (notification.eventId) {
      toastedEventIds.add(notification.eventId)
    }
  }
}

export function clearNotificationToastState(): void {
  toastedNotificationIds.clear()
  toastedEventIds.clear()
  sessionSubscriptionStartedAtMs = 0
}

export function wasNotificationToasted(id: string): boolean {
  return toastedNotificationIds.has(id)
}

export function wasNotificationEventToasted(eventId: string): boolean {
  return toastedEventIds.has(eventId)
}
