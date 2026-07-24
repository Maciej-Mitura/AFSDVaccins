<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import CommonRealtimeStatus from '@/components/common/CommonRealtimeStatus.vue'
import { useNotifications } from '@/composables/useNotifications'
import { useOrders } from '@/composables/useOrders'
import { formatDateTime, mapUserFacingGraphQLError } from '@/i18n'

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
} = useNotifications()

const { loadMyOrders, loadWeeklySummary } = useOrders()

const markingId = ref<string | null>(null)
const actionError = ref<string | null>(null)

let reconnectCleanup: (() => void) | null = null

async function refreshNotifications(): Promise<void> {
  await Promise.all([loadNotifications(), loadUnreadCount()])
}

void refreshNotifications()

onMounted(() => {
  subscribeToNotificationEvents()
  reconnectCleanup = registerReconnectRefetch([
    () => loadMyOrders(),
    async () => {
      await loadWeeklySummary()
    },
  ])
})

onUnmounted(() => {
  stopNotificationSubscription()
  reconnectCleanup?.()
})

async function onMarkRead(id: string): Promise<void> {
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
</script>

<template>
  <div class="space-y-6">
    <CommonRealtimeStatus />

    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">
          {{ t('admin.notifications.title') }}
        </h2>
      </template>

      <CommonLoadingSkeleton v-if="loading && notifications.length === 0" />

      <CommonErrorState
        v-else-if="errorMessage"
        :title="t('admin.notifications.loadFailed')"
        :description="errorMessage"
      />

      <CommonEmptyState
        v-else-if="notifications.length === 0"
        :title="t('admin.notifications.empty.title')"
        :description="t('apotheker.notifications.empty.description')"
      />

      <div v-else class="space-y-4">
        <UAlert
          v-if="actionError"
          color="error"
          variant="subtle"
          :title="actionError"
        />

        <UCard v-for="notification in notifications" :key="notification.id">
          <div class="space-y-3 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-semibold">{{ notification.title }}</h3>
              <UBadge
                v-if="!notification.read"
                color="primary"
                variant="subtle"
              >
                {{ t('status.notification.unread') }}
              </UBadge>
            </div>

            <p>{{ notification.body }}</p>

            <p class="text-muted">
              {{ formatDateTime(notification.createdAt) }}
            </p>

            <div class="flex flex-wrap gap-2">
              <UButton
                v-if="notification.relatedOrderId"
                :to="'/apotheker/orders'"
                size="xs"
                variant="outline"
                color="neutral"
              >
                {{ t('admin.dashboard.goToOrders') }}
              </UButton>

              <UButton
                v-if="!notification.read"
                size="xs"
                variant="soft"
                color="primary"
                :loading="markingId === notification.id"
                @click="onMarkRead(notification.id)"
              >
                {{ t('admin.notifications.markRead') }}
              </UButton>
            </div>
          </div>
        </UCard>
      </div>
    </UCard>
  </div>
</template>
