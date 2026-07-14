<template>
  <div
    v-if="!isOnline"
    class="bg-warning-500 px-4 py-2 text-center text-sm text-white"
    role="status"
    aria-live="polite"
  >
    Je bent offline. Sommige functies zijn tijdelijk niet beschikbaar.
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const isOnline = ref(navigator.onLine)

const updateOnlineStatus = () => {
  isOnline.value = navigator.onLine
}

onMounted(() => {
  window.addEventListener('online', updateOnlineStatus)
  window.addEventListener('offline', updateOnlineStatus)
})

onUnmounted(() => {
  window.removeEventListener('online', updateOnlineStatus)
  window.removeEventListener('offline', updateOnlineStatus)
})
</script>
