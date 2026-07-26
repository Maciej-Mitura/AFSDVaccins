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
import { mapGraphQLError, useCurrentUser } from '@/composables/useCurrentUser'
import useGraphQL, { registerReconnectHandler } from '@/composables/useGraphQL'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import {
  getNotificationOfflineCacheService,
  getOfflineCacheOwnerService,
  getOfflineStorageStatus,
  isOfflineSessionUnlocked,
} from '@/offline'
import { hydrateNotificationsFromCache } from '@/offline/hydrate-from-cache'
import {
  classifyRequestFailure,
  isAuthBarrierFailure,
  isNetworkUnavailableFailure,
  offlineUiErrorMessageKey,
  type NotificationDataSource,
  type OfflineUiErrorCategory,
} from '@/offline/ui-error-category'
import { translate } from '@/i18n'
import { resolveNotificationCopy } from '@/utils/notification-display'

export type NotificationListItem =
  MyNotificationsQuery['myNotifications'][number]

export type { NotificationDataSource, OfflineUiErrorCategory }

const notifications = ref<NotificationListItem[]>([])
const unreadCount = ref(0)
const loading = ref(false)
const refreshing = ref(false)
const errorMessage = ref<string | null>(null)

const notificationSource = ref<NotificationDataSource>('NONE')
const notificationCachedAt = ref<string | null>(null)
const notificationErrorCategory = ref<OfflineUiErrorCategory | null>(null)
const notificationRefreshError = ref<string | null>(null)

/** Actor user id bound to the current realtime subscription (account isolation). */
let boundRecipientUserId: string | null = null

let notificationSubscriptionCleanup: (() => void) | null = null
let reconnectCleanup: (() => void) | null = null
let notificationLoadGeneration = 0

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

function setServerNotificationState(items: NotificationListItem[]): void {
  notifications.value = items
  notificationSource.value = 'SERVER'
  notificationCachedAt.value = null
  notificationErrorCategory.value = null
  notificationRefreshError.value = null
  errorMessage.value = null
}

function setCachedNotificationState(
  items: NotificationListItem[],
  cachedAt: string | null,
): void {
  notifications.value = items
  notificationSource.value = 'CACHE'
  notificationCachedAt.value = cachedAt
  notificationErrorCategory.value = null
  errorMessage.value = null
  unreadCount.value = items.filter(item => !item.read).length
}

function setUnavailableNotificationState(
  category: OfflineUiErrorCategory,
): void {
  notifications.value = []
  unreadCount.value = 0
  notificationSource.value = 'NONE'
  notificationCachedAt.value = null
  notificationErrorCategory.value = category
  errorMessage.value = translate(
    offlineUiErrorMessageKey(category, 'notifications'),
  )
}

export function useNotifications() {
  const { apolloClient } = useGraphQL()
  const { isOnline } = useOnlineStatus()

  const hasUnread = computed(() => unreadCount.value > 0)
  const isEmpty = computed(
    () => !loading.value && notifications.value.length === 0,
  )
  const notificationsAreReadOnly = computed(
    () => notificationSource.value === 'CACHE',
  )

  async function ensureNotificationOwnerUserId(): Promise<string | null> {
    const { currentUser, initialized } = useCurrentUser()
    if (!initialized.value || !currentUser.value?.id) {
      return null
    }

    const user = currentUser.value
    if (!isOfflineSessionUnlocked()) {
      try {
        await getOfflineCacheOwnerService().resolveAuthenticatedOwner({
          role: user.role,
          userId: user.id,
          bezorgerProfileId: user.bezorgerProfile?.id ?? null,
        })
      } catch {
        // Continue; cache reads still require unlock.
      }
    }

    return isOfflineSessionUnlocked() ? user.id : null
  }

  async function tryLoadCachedNotifications(): Promise<boolean> {
    const storage = getOfflineStorageStatus()
    if (storage.mode === 'online-only' || storage.mode === 'unavailable') {
      setUnavailableNotificationState('CACHE_UNAVAILABLE')
      return false
    }

    const userId = await ensureNotificationOwnerUserId()
    if (!userId || !isOfflineSessionUnlocked()) {
      setUnavailableNotificationState('AUTH_REQUIRED')
      return false
    }

    try {
      const { records, expiredFound, cachedAt } =
        await getNotificationOfflineCacheService().readValidNotificationsForOwner(
          userId,
        )

      if (records.length > 0) {
        // Never toast from IndexedDB reads.
        setCachedNotificationState(
          hydrateNotificationsFromCache(records),
          cachedAt,
        )
        return true
      }

      if (expiredFound) {
        setUnavailableNotificationState('OFFLINE_CACHE_EXPIRED')
        return false
      }

      setUnavailableNotificationState('OFFLINE_NO_CACHE')
      return false
    } catch {
      setUnavailableNotificationState('CACHE_UNAVAILABLE')
      return false
    }
  }

  async function cacheNotificationsSnapshot(
    items: NotificationListItem[],
  ): Promise<void> {
    try {
      const userId = await ensureNotificationOwnerUserId()
      if (!userId) {
        return
      }
      await getNotificationOfflineCacheService().replaceCacheFromOnlineList(
        userId,
        items,
      )
    } catch {
      // IndexedDB failure must not break online notification loading.
    }
  }

  async function loadNotifications(
    unreadOnly = false,
    options?: { isRefresh?: boolean },
  ): Promise<void> {
    const generation = ++notificationLoadGeneration
    const isRefresh = options?.isRefresh === true
    const keepShowing = isRefresh && notifications.value.length > 0
    const wasCached = notificationSource.value === 'CACHE'

    if (keepShowing) {
      refreshing.value = true
      notificationRefreshError.value = null
    } else {
      loading.value = true
      errorMessage.value = null
      notificationErrorCategory.value = null
      notificationRefreshError.value = null
    }

    const { currentUser, initialized } = useCurrentUser()

    if (!initialized.value) {
      if (!keepShowing) {
        notifications.value = []
        notificationSource.value = 'NONE'
      }
      loading.value = false
      refreshing.value = false
      return
    }

    if (!currentUser.value?.id) {
      clearNotificationState()
      setUnavailableNotificationState('AUTH_REQUIRED')
      loading.value = false
      refreshing.value = false
      return
    }

    if (!isOnline.value) {
      await tryLoadCachedNotifications()
      if (generation !== notificationLoadGeneration) {
        return
      }
      loading.value = false
      refreshing.value = false
      return
    }

    try {
      const result = await apolloClient.query<MyNotificationsQuery>({
        query: MY_NOTIFICATIONS_QUERY,
        variables: { unreadOnly },
        fetchPolicy: 'network-only',
      })

      if (generation !== notificationLoadGeneration) {
        return
      }

      setServerNotificationState(result.data.myNotifications)

      const { markNotificationsSeenForToast } =
        await import('@/composables/useNotificationToast')
      markNotificationsSeenForToast(notifications.value)

      await cacheNotificationsSnapshot(notifications.value)
    } catch (error: unknown) {
      if (generation !== notificationLoadGeneration) {
        return
      }

      if (isAuthBarrierFailure(error)) {
        clearNotificationState()
        setUnavailableNotificationState(classifyRequestFailure(error))
        throw error
      }

      if (isNetworkUnavailableFailure(error)) {
        if (keepShowing && wasCached) {
          notificationRefreshError.value = translate(
            'offline.notifications.refreshFailed',
          )
          return
        }

        if (!keepShowing) {
          await tryLoadCachedNotifications()
        } else {
          notificationRefreshError.value = translate(
            'offline.notifications.refreshFailed',
          )
        }
        return
      }

      if (keepShowing && wasCached) {
        notificationRefreshError.value = mapGraphQLError(error)
        return
      }

      notificationSource.value = 'NONE'
      notificationCachedAt.value = null
      notificationErrorCategory.value = 'SERVER_ERROR'
      errorMessage.value = mapGraphQLError(error)
      throw error
    } finally {
      if (generation === notificationLoadGeneration) {
        loading.value = false
        refreshing.value = false
      }
    }
  }

  async function loadUnreadCount(): Promise<void> {
    if (!isOnline.value || notificationSource.value === 'CACHE') {
      return
    }

    try {
      const result = await apolloClient.query<MyUnreadNotificationCountQuery>({
        query: MY_UNREAD_NOTIFICATION_COUNT_QUERY,
        fetchPolicy: 'network-only',
      })

      unreadCount.value = result.data.myUnreadNotificationCount
    } catch (error: unknown) {
      if (isNetworkUnavailableFailure(error)) {
        return
      }
      errorMessage.value = mapGraphQLError(error)
      throw error
    }
  }

  async function markNotificationRead(id: string): Promise<void> {
    if (notificationsAreReadOnly.value) {
      errorMessage.value = translate(
        'offline.notifications.readRequiresConnection',
      )
      throw new Error('OFFLINE_READ_ONLY')
    }

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
    if (notificationsAreReadOnly.value) {
      errorMessage.value = translate(
        'offline.notifications.readRequiresConnection',
      )
      throw new Error('OFFLINE_READ_ONLY')
    }

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
            // Realtime events only apply while using authoritative server source.
            if (notificationSource.value === 'CACHE') {
              return
            }

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
        loadNotifications(false, { isRefresh: true }),
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
    notificationLoadGeneration += 1
    stopNotificationSubscription()
    reconnectCleanup?.()
    reconnectCleanup = null
    boundRecipientUserId = null
    notifications.value = []
    unreadCount.value = 0
    loading.value = false
    refreshing.value = false
    errorMessage.value = null
    notificationSource.value = 'NONE'
    notificationCachedAt.value = null
    notificationErrorCategory.value = null
    notificationRefreshError.value = null
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
    refreshing,
    errorMessage,
    hasUnread,
    isEmpty,
    notificationSource,
    notificationCachedAt,
    notificationErrorCategory,
    notificationRefreshError,
    notificationsAreReadOnly,
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

export function __resetNotificationOfflineStateForTests(): void {
  notifications.value = []
  unreadCount.value = 0
  loading.value = false
  refreshing.value = false
  errorMessage.value = null
  notificationSource.value = 'NONE'
  notificationCachedAt.value = null
  notificationErrorCategory.value = null
  notificationRefreshError.value = null
  notificationLoadGeneration += 1
}
