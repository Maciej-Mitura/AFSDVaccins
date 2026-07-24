<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { useAdminNotifications } from '@/composables/useAdminNotifications'
import { formatDateTime } from '@/i18n'

const { t } = useI18n()

const {
  notifications,
  loading,
  errorMessage,
  loadNotifications,
  loadUnreadCount,
  markNotificationRead,
  subscribeToNotificationEvents,
  stopNotificationSubscription,
  registerReconnectRefetch,
} = useAdminNotifications()

let reconnectCleanup: (() => void) | null = null

onMounted(async () => {
  await Promise.all([loadNotifications(), loadUnreadCount()])
  subscribeToNotificationEvents()
  reconnectCleanup = registerReconnectRefetch()
})

onUnmounted(() => {
  stopNotificationSubscription()
  reconnectCleanup?.()
})
</script>

<template>
  <div class="space-y-6">
    <h2 class="text-lg font-semibold">{{ t('admin.notifications.title') }}</h2>

    <CommonLoadingSkeleton v-if="loading && notifications.length === 0" />

    <CommonErrorState
      v-else-if="errorMessage"
      :title="t('admin.notifications.loadFailed')"
      :description="errorMessage"
    />

    <CommonEmptyState
      v-else-if="notifications.length === 0"
      :title="t('admin.notifications.empty.title')"
      :description="t('admin.notifications.empty.description')"
    />

    <div v-else class="space-y-4">
      <UCard v-for="notification in notifications" :key="notification.id">
        <div
          class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
        >
          <div class="space-y-1 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-semibold">{{ notification.title }}</h3>
              <UBadge
                :color="notification.read ? 'neutral' : 'warning'"
                variant="subtle"
              >
                {{
                  notification.read
                    ? t('status.notification.read')
                    : t('status.notification.new')
                }}
              </UBadge>
            </div>
            <p>{{ notification.body }}</p>
            <p class="text-muted">
              {{ formatDateTime(notification.createdAt) }}
            </p>
          </div>

          <UButton
            v-if="!notification.read"
            size="sm"
            variant="outline"
            @click="markNotificationRead(notification.id)"
          >
            {{ t('admin.notifications.markRead') }}
          </UButton>
        </div>
      </UCard>
    </div>
  </div>
</template>
