<template>
  <CommonAppShell
    :title="t('shell.admin.title')"
    :nav-links="adminNavLinks"
    :account-links="adminAccountLinks"
  >
    <template #header-actions>
      <CommonNotificationBell
        to="/admin/notifications"
        :label="t('navigation.admin.notifications')"
      />
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
import CommonNotificationBell from '@/components/common/CommonNotificationBell.vue'
import { useNotifications } from '@/composables/useNotifications'

const { t } = useI18n()

const adminNavLinks = computed<AppShellLink[]>(() => [
  { label: t('navigation.admin.dashboard'), to: '/admin' },
  { label: t('navigation.admin.orders'), to: '/admin/orders' },
  { label: t('navigation.admin.routePlanning'), to: '/admin/route-planning' },
  { label: t('navigation.admin.routeTemplates'), to: '/admin/route-templates' },
  {
    label: t('navigation.admin.courierAnalytics'),
    to: '/admin/analytics/couriers',
  },
  { label: t('navigation.admin.vaccines'), to: '/admin/vaccines' },
  { label: t('navigation.admin.stock'), to: '/admin/stock' },
  { label: t('navigation.admin.settings'), to: '/admin/settings' },
])

const adminAccountLinks = computed<AppShellLink[]>(() => [
  { label: t('navigation.admin.profile'), to: '/profile' },
])

const {
  loadUnreadCount,
  subscribeToNotificationEvents,
  stopNotificationSubscription,
  registerReconnectRefetch,
} = useNotifications()

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
