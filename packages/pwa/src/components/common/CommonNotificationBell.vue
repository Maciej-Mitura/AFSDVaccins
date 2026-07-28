<template>
  <UButton
    :to="to"
    size="sm"
    variant="ghost"
    color="neutral"
    :aria-label="ariaLabel"
    class="relative"
    data-testid="notification-bell"
  >
    {{ label }}
    <UBadge
      v-if="unreadCount > 0"
      color="error"
      variant="solid"
      size="xs"
      class="absolute -right-1 -top-1 min-w-5 justify-center"
      data-testid="notification-unread-badge"
    >
      <span class="sr-only">{{ unreadLabel }}</span>
      {{ unreadCount > 99 ? '99+' : unreadCount }}
    </UBadge>
  </UButton>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useNotifications } from '@/composables/useNotifications'

const props = withDefaults(
  defineProps<{
    to?: string
    label?: string
  }>(),
  {
    to: '/apotheker/notifications',
  },
)

const { t } = useI18n()
const { unreadCount } = useNotifications()

const label = computed(() => props.label ?? t('accessibility.notifications'))
const unreadLabel = computed(() =>
  t('notifications.centre.unreadCount', { count: unreadCount.value }),
)
const ariaLabel = computed(() =>
  unreadCount.value > 0 ? `${label.value}. ${unreadLabel.value}` : label.value,
)
</script>
