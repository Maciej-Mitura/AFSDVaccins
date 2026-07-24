<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useRealtimeConnection } from '@/composables/useRealtimeConnection'

const { t } = useI18n()
const { connectionState } = useRealtimeConnection()

const label = computed(() => {
  switch (connectionState.value) {
    case 'connecting':
      return t('realtime.connecting')
    case 'connected':
      return t('realtime.connected')
    case 'reconnecting':
      return t('realtime.reconnecting')
    case 'unavailable':
      return t('realtime.unavailable')
    default:
      return null
  }
})

const statusColor = computed(() => {
  switch (connectionState.value) {
    case 'connected':
      return 'success'
    case 'connecting':
    case 'reconnecting':
      return 'warning'
    case 'unavailable':
      return 'neutral'
    default:
      return 'neutral'
  }
})
</script>

<template>
  <UAlert
    v-if="label"
    :color="statusColor"
    variant="subtle"
    :title="label"
    class="text-xs"
  />
</template>
