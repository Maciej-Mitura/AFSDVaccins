<template>
  <div
    class="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3"
    data-testid="courier-analytics-kpi"
  >
    <div v-for="card in cards" :key="card.id" class="min-w-0">
      <p class="text-xs font-medium uppercase tracking-wide text-toned">
        {{ t(card.labelKey) }}
      </p>
      <p
        class="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-highlighted"
      >
        {{ card.value }}
      </p>
      <p
        v-if="card.insufficient"
        class="mt-1 text-xs font-medium text-warning"
        role="status"
      >
        {{ t('admin.courierAnalytics.insufficientData') }}
      </p>
      <p v-else-if="card.supportKey" class="mt-1 text-xs text-muted">
        {{ t(card.supportKey, card.supportParams ?? {}) }}
      </p>
    </div>
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
