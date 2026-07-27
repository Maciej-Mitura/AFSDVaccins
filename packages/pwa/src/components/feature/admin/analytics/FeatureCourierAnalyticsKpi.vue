<template>
  <div
    class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
    data-testid="courier-analytics-kpi"
  >
    <UCard v-for="card in cards" :key="card.id" :ui="{ body: 'p-4 sm:p-4' }">
      <p class="text-2xl font-semibold tabular-nums tracking-tight">
        {{ card.value }}
      </p>
      <p class="mt-1 text-sm text-muted">{{ t(card.labelKey) }}</p>
      <p v-if="card.insufficient" class="mt-1 text-xs text-amber-700">
        {{ t('admin.courierAnalytics.insufficientData') }}
      </p>
      <p v-else-if="card.supportKey" class="mt-1 text-xs text-muted">
        {{ t(card.supportKey, card.supportParams ?? {}) }}
      </p>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { KpiCardVm } from '@/composables/courier-analytics-mappers'

defineProps<{
  cards: KpiCardVm[]
}>()

const { t } = useI18n()
</script>
