<template>
  <UAlert
    color="warning"
    variant="subtle"
    icon="i-lucide-shield-alert"
    title="Geen toegang"
    :description="description"
  />
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    description?: string
  }>(),
  {
    description: 'Je hebt geen rechten om deze pagina te bekijken.',
  },
)
</script>
