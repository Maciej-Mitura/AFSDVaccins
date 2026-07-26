<template>
  <CommonAppShell
    :title="t('shell.apotheker.title')"
    :nav-links="apothekerNavLinks"
  >
    <template #header-actions>
      <CommonNotificationBell />
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
import { useOrders } from '@/composables/useOrders'

const { t } = useI18n()

const apothekerNavLinks = computed<AppShellLink[]>(() => [
  { label: t('navigation.apotheker.dashboard'), to: '/apotheker' },
  { label: t('navigation.apotheker.vaccines'), to: '/apotheker/vaccines' },
  { label: t('navigation.apotheker.newOrder'), to: '/apotheker/orders/new' },
  { label: t('navigation.apotheker.orders'), to: '/apotheker/orders' },
  {
    label: t('navigation.apotheker.notifications'),
    to: '/apotheker/notifications',
  },
  { label: t('navigation.apotheker.profile'), to: '/profile' },
])

const {
  loadUnreadCount,
  subscribeToNotificationEvents,
  stopNotificationSubscription,
  registerReconnectRefetch,
} = useNotifications()

const { loadMyOrders, loadWeeklySummary } = useOrders()

let reconnectCleanup: (() => void) | null = null

onMounted(() => {
  void loadUnreadCount()
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
</script>
