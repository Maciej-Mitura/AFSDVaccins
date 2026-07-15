<template>
  <CommonAppShell title="Apotheker" :nav-links="apothekerNavLinks">
    <template #header-actions>
      <CommonNotificationBell />
    </template>
    <RouterView />
  </CommonAppShell>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

import CommonAppShell, {
  type AppShellLink,
} from '@/components/common/CommonAppShell.vue'
import CommonNotificationBell from '@/components/common/CommonNotificationBell.vue'
import { useNotifications } from '@/composables/useNotifications'
import { useOrders } from '@/composables/useOrders'

const apothekerNavLinks: AppShellLink[] = [
  { label: 'Dashboard', to: '/apotheker' },
  { label: 'Vaccins', to: '/apotheker/vaccines' },
  { label: 'Nieuwe bestelling', to: '/apotheker/orders/new' },
  { label: 'Mijn bestellingen', to: '/apotheker/orders' },
  { label: 'Profiel', to: '/profile' },
]

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
