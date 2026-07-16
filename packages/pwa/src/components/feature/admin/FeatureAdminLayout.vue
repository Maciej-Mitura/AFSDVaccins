<template>
  <CommonAppShell title="Administratie" :nav-links="adminNavLinks">
    <template #header-actions>
      <UButton
        to="/admin/notifications"
        size="sm"
        variant="ghost"
        color="neutral"
      >
        Meldingen
        <UBadge v-if="hasUnread" color="warning" variant="solid" class="ml-1">
          {{ unreadCount }}
        </UBadge>
      </UButton>
    </template>
    <RouterView />
  </CommonAppShell>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

import CommonAppShell, {
  type AppShellLink,
} from '@/components/common/CommonAppShell.vue'
import { useAdminNotifications } from '@/composables/useAdminNotifications'

const adminNavLinks: AppShellLink[] = [
  { label: 'Dashboard', to: '/admin' },
  { label: 'Bestellingen', to: '/admin/orders' },
  { label: 'Routetemplates', to: '/admin/route-templates' },
  { label: 'Vaccins', to: '/admin/vaccines' },
  { label: 'Voorraad', to: '/admin/stock' },
  { label: 'Instellingen', to: '/admin/settings' },
  { label: 'Profiel', to: '/profile' },
]

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
