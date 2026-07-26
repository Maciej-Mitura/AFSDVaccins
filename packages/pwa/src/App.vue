<template>
  <UApp>
    <CommonPwaStatus />

    <div
      v-if="!authReady"
      class="flex min-h-screen items-center justify-center bg-default"
    >
      <CommonLoadingSkeleton />
    </div>

    <RouterView v-else />
  </UApp>
</template>

<script setup lang="ts">
import { inject, onMounted, type Ref } from 'vue'

import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import CommonPwaStatus from '@/components/common/CommonPwaStatus.vue'
import { setNotificationToastApi } from '@/composables/useNotificationToast'

const authReady = inject<Ref<boolean>>('authReady')

onMounted(() => {
  // useToast is auto-imported by @nuxt/ui Vite plugin.
  setNotificationToastApi(useToast())
})
</script>
