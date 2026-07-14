<template>
  <UApp>
    <CommonOfflineBanner />

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
import { inject, type Ref } from 'vue'

import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import CommonOfflineBanner from '@/components/common/CommonOfflineBanner.vue'

const authReady = inject<Ref<boolean>>('authReady')
</script>
