<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { useAdminNotifications } from '@/composables/useAdminNotifications'

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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('nl-BE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
</script>

<template>
  <div class="space-y-6">
    <h2 class="text-lg font-semibold">Meldingen</h2>

    <CommonLoadingSkeleton v-if="loading && notifications.length === 0" />

    <CommonErrorState
      v-else-if="errorMessage"
      title="Meldingen laden mislukt"
      :description="errorMessage"
    />

    <CommonEmptyState
      v-else-if="notifications.length === 0"
      title="Geen meldingen"
      description="Er zijn momenteel geen operationele meldingen."
    />

    <div v-else class="space-y-4">
      <UCard v-for="notification in notifications" :key="notification.id">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="space-y-1 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-semibold">{{ notification.title }}</h3>
              <UBadge
                :color="notification.read ? 'neutral' : 'warning'"
                variant="subtle"
              >
                {{ notification.read ? 'Gelezen' : 'Nieuw' }}
              </UBadge>
            </div>
            <p>{{ notification.body }}</p>
            <p class="text-muted">{{ formatDate(notification.createdAt) }}</p>
          </div>

          <UButton
            v-if="!notification.read"
            size="sm"
            variant="outline"
            @click="markNotificationRead(notification.id)"
          >
            Markeer als gelezen
          </UButton>
        </div>
      </UCard>
    </div>
  </div>
</template>
