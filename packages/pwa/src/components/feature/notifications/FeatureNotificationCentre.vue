<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { useNotifications } from '@/composables/useNotifications'
import { formatDateTime, mapUserFacingGraphQLError } from '@/i18n'
import { sanitizeInternalActionPath } from '@/utils/notification-action-path'
import { resolveNotificationCopy } from '@/utils/notification-display'

const props = withDefaults(
  defineProps<{
    emptyDescriptionKey?: string
  }>(),
  {
    emptyDescriptionKey: 'notifications.centre.empty.description',
  },
)

const { t } = useI18n()
const router = useRouter()

const {
  notifications,
  loading,
  refreshing,
  errorMessage,
  hasUnread,
  notificationCachedAt,
  notificationRefreshError,
  notificationsAreReadOnly,
  loadNotifications,
  loadUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} = useNotifications()

const markingId = ref<string | null>(null)
const markingAll = ref(false)
const actionError = ref<string | null>(null)

const displayItems = computed(() =>
  notifications.value.map(notification => {
    const copy = resolveNotificationCopy(notification, (key, values) =>
      t(key, values as Record<string, unknown>),
    )
    return {
      ...notification,
      displayTitle: copy.title,
      displayBody: copy.body,
      safeActionPath: sanitizeInternalActionPath(notification.actionPath),
    }
  }),
)

const cachedAtLabel = computed(() => {
  if (!notificationCachedAt.value) {
    return null
  }
  return t('offline.lastUpdated', {
    dateTime: formatDateTime(notificationCachedAt.value),
  })
})

async function refresh(): Promise<void> {
  await Promise.all([
    loadNotifications(false, { isRefresh: notifications.value.length > 0 }),
    loadUnreadCount(),
  ])
}

onMounted(() => {
  // Role layouts own realtime subscription + reconnect; this view only loads history.
  void refresh()
})

async function onMarkRead(id: string): Promise<void> {
  if (notificationsAreReadOnly.value) {
    actionError.value = t('offline.notifications.readRequiresConnection')
    return
  }

  actionError.value = null
  markingId.value = id

  try {
    await markNotificationRead(id)
  } catch (error: unknown) {
    actionError.value =
      error instanceof Error
        ? mapUserFacingGraphQLError(error)
        : t('errors.notification.markReadFailed')
  } finally {
    markingId.value = null
  }
}

async function onMarkAllRead(): Promise<void> {
  if (notificationsAreReadOnly.value) {
    actionError.value = t('offline.notifications.readRequiresConnection')
    return
  }

  actionError.value = null
  markingAll.value = true

  try {
    await markAllNotificationsRead()
  } catch (error: unknown) {
    actionError.value =
      error instanceof Error
        ? mapUserFacingGraphQLError(error)
        : t('errors.notification.markAllReadFailed')
  } finally {
    markingAll.value = false
  }
}

async function onOpenAction(
  path: string,
  notificationId: string,
  isRead: boolean,
): Promise<void> {
  if (!isRead && !notificationsAreReadOnly.value) {
    try {
      await markNotificationRead(notificationId)
    } catch {
      // Navigation still proceeds.
    }
  }

  await router.push(path)
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-lg font-semibold">
        {{ t('notifications.centre.title') }}
      </h2>

      <UButton
        v-if="hasUnread && !notificationsAreReadOnly"
        size="sm"
        variant="soft"
        color="primary"
        :loading="markingAll"
        data-testid="notifications-mark-all-read"
        @click="onMarkAllRead"
      >
        {{ t('notifications.centre.markAllRead') }}
      </UButton>
    </div>

    <UAlert
      v-if="notificationsAreReadOnly"
      color="warning"
      variant="subtle"
      icon="i-lucide-wifi-off"
      role="status"
      data-testid="offline-notifications-banner"
      :title="t('offline.notifications.banner')"
      :description="t('offline.copy.description')"
    />

    <p
      v-if="cachedAtLabel"
      class="text-sm text-muted"
      data-testid="offline-notifications-cached-at"
    >
      {{ cachedAtLabel }}
    </p>

    <p
      v-if="refreshing"
      class="text-sm text-muted"
      role="status"
      aria-live="polite"
    >
      {{ t('offline.route.refreshing') }}
    </p>

    <UAlert
      v-if="notificationRefreshError"
      color="warning"
      variant="subtle"
      role="status"
      :title="notificationRefreshError"
    >
      <template #actions>
        <UButton
          size="xs"
          variant="soft"
          :loading="refreshing"
          @click="refresh"
        >
          {{ t('common.retry') }}
        </UButton>
      </template>
    </UAlert>

    <p
      v-if="notificationsAreReadOnly && hasUnread"
      class="text-sm text-muted"
      role="status"
      data-testid="offline-notifications-read-disabled"
    >
      {{ t('offline.notifications.readRequiresConnection') }}
    </p>

    <CommonLoadingSkeleton v-if="loading && notifications.length === 0" />

    <CommonErrorState
      v-else-if="errorMessage && notifications.length === 0"
      :title="t('notifications.centre.loadFailed')"
      :description="errorMessage"
    />

    <CommonEmptyState
      v-else-if="notifications.length === 0"
      :title="t('notifications.centre.empty.title')"
      :description="t(props.emptyDescriptionKey)"
    />

    <div v-else class="space-y-4">
      <UAlert
        v-if="actionError"
        color="error"
        variant="subtle"
        :title="actionError"
        role="alert"
      />

      <ul
        class="space-y-4"
        role="list"
        :aria-label="t('notifications.centre.title')"
      >
        <li v-for="notification in displayItems" :key="notification.id">
          <article
            class="space-y-3 rounded-md border border-default p-4 text-sm"
            :data-testid="`notification-item-${notification.id}`"
            :aria-labelledby="`notification-title-${notification.id}`"
          >
            <div class="flex flex-wrap items-center gap-2">
              <h3
                :id="`notification-title-${notification.id}`"
                class="font-semibold"
              >
                {{ notification.displayTitle }}
              </h3>
              <UBadge
                :color="notification.read ? 'neutral' : 'warning'"
                variant="subtle"
              >
                <span class="sr-only">
                  {{
                    notification.read
                      ? t('status.notification.read')
                      : t('status.notification.unread')
                  }}
                </span>
                {{
                  notification.read
                    ? t('status.notification.read')
                    : t('status.notification.unread')
                }}
              </UBadge>
            </div>

            <p>{{ notification.displayBody }}</p>

            <p class="text-muted">
              <time :datetime="String(notification.createdAt)">
                {{ formatDateTime(notification.createdAt) }}
              </time>
            </p>

            <div class="flex flex-wrap gap-2">
              <UButton
                v-if="notification.safeActionPath"
                size="xs"
                variant="outline"
                color="neutral"
                @click="
                  onOpenAction(
                    notification.safeActionPath,
                    notification.id,
                    notification.read,
                  )
                "
              >
                {{ t('notifications.centre.openDetails') }}
              </UButton>

              <UButton
                v-if="!notification.read && !notificationsAreReadOnly"
                size="xs"
                variant="soft"
                color="primary"
                :loading="markingId === notification.id"
                data-testid="notifications-mark-read"
                @click="onMarkRead(notification.id)"
              >
                {{ t('notifications.centre.markRead') }}
              </UButton>
            </div>
          </article>
        </li>
      </ul>
    </div>
  </div>
</template>
