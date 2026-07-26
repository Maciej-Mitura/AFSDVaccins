import { computed, ref } from 'vue'

import {
  MARK_NOTIFICATION_READ_MUTATION,
  MY_NOTIFICATIONS_QUERY,
  MY_UNREAD_NOTIFICATION_COUNT_QUERY,
  NOTIFICATION_RECEIVED_SUBSCRIPTION,
  type MarkNotificationReadMutation,
  type MyNotificationsQuery,
  type MyUnreadNotificationCountQuery,
  type NotificationReceivedSubscription,
} from '@/assets/graphql/notification'
import { mapGraphQLError } from '@/composables/useCurrentUser'
import useGraphQL, { registerReconnectHandler } from '@/composables/useGraphQL'

export type AdminNotificationListItem =
  MyNotificationsQuery['myNotifications'][number]

const notifications = ref<AdminNotificationListItem[]>([])
const unreadCount = ref(0)
const loading = ref(false)
const errorMessage = ref<string | null>(null)

let notificationSubscriptionCleanup: (() => void) | null = null
let reconnectCleanup: (() => void) | null = null

function upsertNotification(notification: AdminNotificationListItem): void {
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

export function useAdminNotifications() {
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
          upsertNotification(updated as AdminNotificationListItem)
        }
      }
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    }
  }

  function stopNotificationSubscription(): void {
    notificationSubscriptionCleanup?.()
    notificationSubscriptionCleanup = null
  }

  function subscribeToNotificationEvents(): () => void {
    stopNotificationSubscription()

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
            if (!existed) {
              void import('@/composables/useNotificationToast').then(
                ({ showNotificationToastIfNew }) => {
                  showNotificationToastIfNew(notification)
                },
              )
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

  function clearAdminNotificationState(): void {
    stopNotificationSubscription()
    reconnectCleanup?.()
    reconnectCleanup = null
    notifications.value = []
    unreadCount.value = 0
    loading.value = false
    errorMessage.value = null
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
    subscribeToNotificationEvents,
    stopNotificationSubscription,
    registerReconnectRefetch,
    clearAdminNotificationState,
  }
}
