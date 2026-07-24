<template>
  <UButton
    to="/apotheker/notifications"
    size="sm"
    variant="ghost"
    color="neutral"
    :aria-label="t('accessibility.notifications')"
    class="relative"
  >
    {{ t('accessibility.notifications') }}
    <UBadge
      v-if="unreadCount > 0"
      color="error"
      variant="solid"
      size="xs"
      class="absolute -right-1 -top-1 min-w-5 justify-center"
    >
      {{ unreadCount > 99 ? '99+' : unreadCount }}
    </UBadge>
  </UButton>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useNotifications } from '@/composables/useNotifications'

const { t } = useI18n()
const { unreadCount } = useNotifications()
</script>
