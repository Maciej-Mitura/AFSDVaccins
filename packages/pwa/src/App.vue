<template>
  <UApp>
    <CommonOfflineBanner />
    <RouterView />
  </UApp>
</template>

<script setup lang="ts">
import CommonOfflineBanner from '@/components/common/CommonOfflineBanner.vue'
</script>
