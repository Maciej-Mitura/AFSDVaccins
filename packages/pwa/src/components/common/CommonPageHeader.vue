<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
  meta?: string
}>()
</script>

<template>
  <header class="mb-6" data-testid="common-page-header">
    <div
      class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
    >
      <div class="min-w-0 space-y-1">
        <h1 class="text-xl font-semibold tracking-tight text-highlighted">
          {{ title }}
        </h1>
        <p v-if="subtitle" class="text-sm text-toned">
          {{ subtitle }}
        </p>
        <p
          v-if="meta"
          class="text-sm text-muted"
          data-testid="common-page-header-meta"
        >
          {{ meta }}
        </p>
      </div>
      <div
        v-if="$slots.actions"
        class="flex shrink-0 flex-wrap items-center gap-2"
        data-testid="common-page-header-actions"
      >
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>
