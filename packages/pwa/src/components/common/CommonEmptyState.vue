<template>
  <div class="py-8 text-center">
    <UIcon name="i-lucide-inbox" class="mx-auto mb-3 size-8 text-muted" />
    <p class="text-lg font-medium">{{ title }}</p>
    <p v-if="description" class="mt-1 text-sm text-muted">{{ description }}</p>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
}>()
</script>
