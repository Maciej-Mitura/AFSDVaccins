<script setup lang="ts">
import { computed } from 'vue'

import { useRealtimeConnection } from '@/composables/useRealtimeConnection'

const { connectionState } = useRealtimeConnection()

const label = computed(() => {
  switch (connectionState.value) {
    case 'connecting':
      return 'Live updates verbinden…'
    case 'connected':
      return 'Live updates actief'
    case 'reconnecting':
      return 'Opnieuw verbinden…'
    case 'unavailable':
      return 'Live updates tijdelijk niet beschikbaar'
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
