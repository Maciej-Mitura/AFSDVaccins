<template>
  <div class="space-y-3" aria-busy="true" :aria-label="t('common.loading')">
    <USkeleton class="h-6 w-1/3" />
    <USkeleton class="h-4 w-full" />
    <USkeleton class="h-4 w-5/6" />
    <USkeleton class="h-4 w-2/3" />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>
