<template>
  <UCard class="max-w-lg">
    <template #header>
      <h2 class="text-lg font-semibold">Bezorger route</h2>
    </template>
    <CommonEmptyState
      title="Geen route vandaag"
      description="Mobiele route-uitvoering volgt in Phase 12–14."
    />
  </UCard>
</template>

<script setup lang="ts">
import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
</script>
