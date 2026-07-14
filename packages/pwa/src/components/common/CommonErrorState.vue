<template>
  <UAlert
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :title="title"
    :description="description"
  />
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    description?: string
  }>(),
  {
    title: 'Er is iets misgegaan',
    description: 'Probeer het later opnieuw of neem contact op met support.',
  },
)
</script>
