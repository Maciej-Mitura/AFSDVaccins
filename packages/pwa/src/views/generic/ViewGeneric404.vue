<template>
  <div class="mx-auto max-w-lg px-4 py-16 text-center">
    <UIcon name="i-lucide-search-x" class="mx-auto mb-4 size-10 text-muted" />
    <h1 class="text-2xl font-semibold text-highlighted">
      {{ t('common.notFound.title') }}
    </h1>
    <p class="mt-2 text-sm text-toned">
      {{ t('common.notFound.description') }}
    </p>
    <UButton class="mt-6 min-h-11" to="/admin" variant="soft">
      {{ t('common.go.admin') }}
    </UButton>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>
