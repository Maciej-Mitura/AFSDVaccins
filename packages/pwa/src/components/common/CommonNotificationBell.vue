<template>
  <UButton
    to="/apotheker/notifications"
    size="sm"
    variant="ghost"
    color="neutral"
    aria-label="Meldingen"
    class="relative"
  >
    Meldingen
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
import { useNotifications } from '@/composables/useNotifications'

const { unreadCount } = useNotifications()
</script>
