/**
 * Admin notification store — shares the single actor-scoped notification module.
 * Kept as a named export so existing admin layout imports remain stable.
 */
import { useNotifications } from '@/composables/useNotifications'

export type AdminNotificationListItem = ReturnType<
  typeof useNotifications
>['notifications']['value'][number]

export function useAdminNotifications() {
  const api = useNotifications()

  return {
    notifications: api.notifications,
    unreadCount: api.unreadCount,
    loading: api.loading,
    errorMessage: api.errorMessage,
    hasUnread: api.hasUnread,
    isEmpty: api.isEmpty,
    loadNotifications: api.loadNotifications,
    loadUnreadCount: api.loadUnreadCount,
    markNotificationRead: api.markNotificationRead,
    markAllNotificationsRead: api.markAllNotificationsRead,
    subscribeToNotificationEvents: api.subscribeToNotificationEvents,
    stopNotificationSubscription: api.stopNotificationSubscription,
    registerReconnectRefetch: api.registerReconnectRefetch,
    clearAdminNotificationState: api.clearNotificationState,
  }
}
