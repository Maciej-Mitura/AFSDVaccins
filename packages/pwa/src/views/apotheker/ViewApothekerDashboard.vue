<template>
  <UCard>
    <template #header>
      <h2 class="text-lg font-semibold">Apotheker dashboard</h2>
    </template>
    <CommonEmptyState
      title="Nog geen bestellingen"
      description="Domeinschermen voor vaccinbestellingen volgen in Phase 7."
    />
  </UCard>
</template>

<script setup lang="ts">
import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
</script>
