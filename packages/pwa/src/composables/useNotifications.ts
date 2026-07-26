import { computed, ref } from 'vue'

import {
  MARK_ALL_NOTIFICATIONS_READ_MUTATION,
  MARK_NOTIFICATION_READ_MUTATION,
  MY_NOTIFICATIONS_QUERY,
  MY_UNREAD_NOTIFICATION_COUNT_QUERY,
  NOTIFICATION_RECEIVED_SUBSCRIPTION,
  type MarkAllNotificationsReadMutation,
  type MarkNotificationReadMutation,
  type MyNotificationsQuery,
  type MyUnreadNotificationCountQuery,
  type NotificationReceivedSubscription,
} from '@/assets/graphql/notification'
import { mapGraphQLError } from '@/composables/useCurrentUser'
import useGraphQL, { registerReconnectHandler } from '@/composables/useGraphQL'
import { resolveNotificationCopy } from '@/utils/notification-display'

export type NotificationListItem =
  MyNotificationsQuery['myNotifications'][number]

const notifications = ref<NotificationListItem[]>([])
const unreadCount = ref(0)
const loading = ref(false)
const errorMessage = ref<string | null>(null)

/** Actor user id bound to the current realtime subscription (account isolation). */
let boundRecipientUserId: string | null = null

let notificationSubscriptionCleanup: (() => void) | null = null
let reconnectCleanup: (() => void) | null = null

let translateFn:
  ((key: string, values?: Record<string, unknown>) => string) | null = null

export function setNotificationTranslate(
  fn: ((key: string, values?: Record<string, unknown>) => string) | null,
): void {
  translateFn = fn
}

function upsertNotification(notification: NotificationListItem): void {
  const existingIndex = notifications.value.findIndex(
    item => item.id === notification.id,
  )

  if (existingIndex === -1) {
    notifications.value = [notification, ...notifications.value]
    if (!notification.read) {
      unreadCount.value += 1
    }
    return
  }

  const previous = notifications.value[existingIndex]
  notifications.value = notifications.value.map(item =>
    item.id === notification.id ? { ...item, ...notification } : item,
  )

  if (!previous.read && notification.read) {
    unreadCount.value = Math.max(0, unreadCount.value - 1)
  } else if (previous.read && !notification.read) {
    unreadCount.value += 1
  }
}

function toastForNewNotification(notification: NotificationListItem): void {
  void import('@/composables/useNotificationToast').then(
    ({ showNotificationToastIfNew }) => {
      const copy = translateFn
        ? resolveNotificationCopy(notification, translateFn)
        : { title: notification.title, body: notification.body }

      showNotificationToastIfNew({
        id: notification.id,
        eventId: notification.eventId,
        title: copy.title,
        body: copy.body,
        read: notification.read,
        actionPath: notification.actionPath,
        createdAt: notification.createdAt,
      })
    },
  )
}

export function useNotifications() {
  const { apolloClient } = useGraphQL()

  const hasUnread = computed(() => unreadCount.value > 0)
  const isEmpty = computed(
    () => !loading.value && notifications.value.length === 0,
  )

  async function loadNotifications(unreadOnly = false): Promise<void> {
    loading.value = true
    errorMessage.value = null

    try {
      const result = await apolloClient.query<MyNotificationsQuery>({
        query: MY_NOTIFICATIONS_QUERY,
        variables: { unreadOnly },
        fetchPolicy: 'network-only',
      })

      notifications.value = result.data.myNotifications
      const { markNotificationsSeenForToast } =
        await import('@/composables/useNotificationToast')
      markNotificationsSeenForToast(notifications.value)
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function loadUnreadCount(): Promise<void> {
    try {
      const result = await apolloClient.query<MyUnreadNotificationCountQuery>({
        query: MY_UNREAD_NOTIFICATION_COUNT_QUERY,
        fetchPolicy: 'network-only',
      })

      unreadCount.value = result.data.myUnreadNotificationCount
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    }
  }

  async function markNotificationRead(id: string): Promise<void> {
    errorMessage.value = null

    try {
      const result = await apolloClient.mutate<MarkNotificationReadMutation>({
        mutation: MARK_NOTIFICATION_READ_MUTATION,
        variables: { id },
      })

      const updated = result.data?.markNotificationRead

      if (updated) {
        const existing = notifications.value.find(item => item.id === id)

        if (existing) {
          upsertNotification({ ...existing, ...updated })
        } else {
          upsertNotification(updated as NotificationListItem)
        }
      }
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    }
  }

  async function markAllNotificationsRead(): Promise<number> {
    errorMessage.value = null

    try {
      const result =
        await apolloClient.mutate<MarkAllNotificationsReadMutation>({
          mutation: MARK_ALL_NOTIFICATIONS_READ_MUTATION,
        })

      const updatedCount = result.data?.markAllNotificationsRead ?? 0

      notifications.value = notifications.value.map(item =>
        item.read
          ? item
          : {
              ...item,
              read: true,
              readAt: item.readAt ?? new Date().toISOString(),
            },
      )
      unreadCount.value = 0

      return updatedCount
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    }
  }

  function stopNotificationSubscription(): void {
    notificationSubscriptionCleanup?.()
    notificationSubscriptionCleanup = null
  }

  function subscribeToNotificationEvents(options?: {
    recipientUserId?: string | null
  }): () => void {
    stopNotificationSubscription()

    boundRecipientUserId = options?.recipientUserId ?? boundRecipientUserId

    void import('@/composables/useNotificationToast').then(
      ({ markNotificationToastSubscriptionBoundary }) => {
        markNotificationToastSubscriptionBoundary()
      },
    )

    const subscription = apolloClient
      .subscribe<NotificationReceivedSubscription>({
        query: NOTIFICATION_RECEIVED_SUBSCRIPTION,
      })
      .subscribe({
        next: ({ data }) => {
          const notification = data?.notificationReceived

          if (notification) {
            const existed = notifications.value.some(
              item => item.id === notification.id,
            )
            upsertNotification(notification)
            // Toast only for newly arrived unread events — not reconnect upserts.
            if (!existed) {
              toastForNewNotification(notification)
            }
          }
        },
      })

    const cleanup = (): void => {
      subscription.unsubscribe()
      notificationSubscriptionCleanup = null
    }

    notificationSubscriptionCleanup = cleanup

    return cleanup
  }

  function registerReconnectRefetch(
    extraHandlers: Array<() => void | Promise<void>> = [],
  ): () => void {
    reconnectCleanup?.()

    reconnectCleanup = registerReconnectHandler(async () => {
      await Promise.all([
        loadNotifications(),
        loadUnreadCount(),
        ...extraHandlers.map(handler => Promise.resolve(handler())),
      ])
    })

    return () => {
      reconnectCleanup?.()
      reconnectCleanup = null
    }
  }

  function clearNotificationState(): void {
    stopNotificationSubscription()
    reconnectCleanup?.()
    reconnectCleanup = null
    boundRecipientUserId = null
    notifications.value = []
    unreadCount.value = 0
    loading.value = false
    errorMessage.value = null
    void import('@/composables/useNotificationToast').then(
      ({ clearNotificationToastState }) => {
        clearNotificationToastState()
      },
    )
  }

  return {
    notifications,
    unreadCount,
    loading,
    errorMessage,
    hasUnread,
    isEmpty,
    loadNotifications,
    loadUnreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    subscribeToNotificationEvents,
    stopNotificationSubscription,
    registerReconnectRefetch,
    clearNotificationState,
  }
}

export function __getBoundRecipientUserIdForTests(): string | null {
  return boundRecipientUserId
}
