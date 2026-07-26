<template>
  <CommonAppShell
    :title="t('shell.bezorger.title')"
    :nav-links="bezorgerNavLinks"
  >
    <template #header-actions>
      <CommonNotificationBell
        to="/bezorger/notifications"
        :label="t('navigation.bezorger.notifications')"
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

const bezorgerNavLinks = computed<AppShellLink[]>(() => [
  { label: t('navigation.bezorger.dashboard'), to: '/bezorger' },
  { label: t('navigation.bezorger.today'), to: '/bezorger/today' },
  { label: t('navigation.bezorger.tomorrow'), to: '/bezorger/tomorrow' },
  {
    label: t('navigation.bezorger.notifications'),
    to: '/bezorger/notifications',
  },
  { label: t('navigation.bezorger.profile'), to: '/profile' },
])

const {
  loadUnreadCount,
  subscribeToNotificationEvents,
  stopNotificationSubscription,
  registerReconnectRefetch,
} = useNotifications()

let reconnectCleanup: (() => void) | null = null

onMounted(() => {
  void loadUnreadCount()
  subscribeToNotificationEvents()
  reconnectCleanup = registerReconnectRefetch()
})

onUnmounted(() => {
  stopNotificationSubscription()
  reconnectCleanup?.()
})
</script>
