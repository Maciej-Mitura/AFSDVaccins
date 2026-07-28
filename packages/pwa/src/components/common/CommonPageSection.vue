<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    description?: string
    variant?: 'default' | 'inset'
  }>(),
  {
    variant: 'default',
  },
)
</script>

<template>
  <section
    class="space-y-3"
    :class="variant === 'inset' ? 'rounded-md bg-muted px-4 py-4' : undefined"
    data-testid="common-page-section"
    :data-variant="variant"
  >
    <div
      v-if="title || description || $slots.actions"
      class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
    >
      <div class="min-w-0 space-y-1">
        <h2 v-if="title" class="text-base font-semibold text-highlighted">
          {{ title }}
        </h2>
        <p v-if="description" class="text-sm text-toned">
          {{ description }}
        </p>
      </div>
      <div
        v-if="$slots.actions"
        class="flex shrink-0 flex-wrap items-center gap-2"
        data-testid="common-page-section-actions"
      >
        <slot name="actions" />
      </div>
    </div>
    <div data-testid="common-page-section-body">
      <slot />
    </div>
  </section>
</template>
