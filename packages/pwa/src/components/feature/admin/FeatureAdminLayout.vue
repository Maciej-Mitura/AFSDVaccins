<template>
  <CommonAppShell :title="t('shell.admin.title')" :nav-links="adminNavLinks">
    <template #header-actions>
      <UButton
        to="/admin/notifications"
        size="sm"
        variant="ghost"
        color="neutral"
      >
        {{ t('navigation.admin.notifications') }}
        <UBadge v-if="hasUnread" color="warning" variant="solid" class="ml-1">
          {{ unreadCount }}
        </UBadge>
      </UButton>
    </template>
    <RouterView />
  </CommonAppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

import CommonAppShell, {
  type AppShellLink,
} from '@/components/common/CommonAppShell.vue'
import { useAdminNotifications } from '@/composables/useAdminNotifications'

const { t } = useI18n()

const adminNavLinks = computed<AppShellLink[]>(() => [
  { label: t('navigation.admin.dashboard'), to: '/admin' },
  { label: t('navigation.admin.orders'), to: '/admin/orders' },
  { label: t('navigation.admin.routePlanning'), to: '/admin/route-planning' },
  { label: t('navigation.admin.routeTemplates'), to: '/admin/route-templates' },
  { label: t('navigation.admin.vaccines'), to: '/admin/vaccines' },
  { label: t('navigation.admin.stock'), to: '/admin/stock' },
  { label: t('navigation.admin.settings'), to: '/admin/settings' },
  { label: t('navigation.admin.profile'), to: '/profile' },
])

const {
  unreadCount,
  hasUnread,
  loadUnreadCount,
  subscribeToNotificationEvents,
  stopNotificationSubscription,
  registerReconnectRefetch,
} = useAdminNotifications()

let reconnectCleanup: (() => void) | null = null

onMounted(async () => {
  await loadUnreadCount()
  subscribeToNotificationEvents()
  reconnectCleanup = registerReconnectRefetch()
})

onUnmounted(() => {
  stopNotificationSubscription()
  reconnectCleanup?.()
})
</script>
