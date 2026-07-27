<template>
  <div class="overflow-x-auto" data-testid="courier-analytics-leaderboard">
    <table class="w-full min-w-[40rem] text-left text-sm">
      <caption class="sr-only">
        {{
          t('admin.courierAnalytics.leaderboard.caption')
        }}
      </caption>
      <thead>
        <tr
          class="border-b border-default text-xs uppercase tracking-wide text-muted"
        >
          <th
            scope="col"
            class="sticky left-0 bg-elevated py-2 pr-3 font-medium"
          >
            {{ t('admin.courierAnalytics.column.rank') }}
          </th>
          <th
            scope="col"
            class="sticky left-10 bg-elevated py-2 pr-3 font-medium"
          >
            {{ t('admin.courierAnalytics.column.courier') }}
          </th>
          <th scope="col" class="py-2 pr-3 font-medium">
            {{ t('admin.courierAnalytics.reliabilityScore') }}
          </th>
          <th scope="col" class="py-2 pr-3 font-medium">
            {{ t('admin.courierAnalytics.column.completedRoutes') }}
          </th>
          <th scope="col" class="py-2 pr-3 font-medium">
            {{ t('admin.courierAnalytics.column.deliveredStops') }}
          </th>
          <th scope="col" class="py-2 pr-3 font-medium">
            {{ t('admin.courierAnalytics.column.onTimeRate') }}
          </th>
          <th scope="col" class="py-2 pr-3 font-medium">
            {{ t('admin.courierAnalytics.column.qrProofRate') }}
          </th>
          <th scope="col" class="py-2 font-medium">
            {{ t('admin.courierAnalytics.column.dataCompleteness') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rankings"
          :key="row.courierProfileId"
          class="cursor-pointer border-b border-default transition-colors hover:bg-elevated/80"
          :class="rowClass(row)"
          :aria-selected="row.courierProfileId === selectedId"
          tabindex="0"
          @click="emit('select', row.courierProfileId)"
          @keydown.enter="emit('select', row.courierProfileId)"
          @keydown.space.prevent="emit('select', row.courierProfileId)"
        >
          <td
            class="sticky left-0 bg-inherit py-2.5 pr-3 font-medium tabular-nums"
          >
            <span class="sr-only">{{
              t('admin.courierAnalytics.column.rank')
            }}</span>
            {{ row.rank }}
          </td>
          <td class="sticky left-10 bg-inherit py-2.5 pr-3">
            <span class="font-medium">{{ row.displayName }}</span>
            <span
              v-if="row.vehicleLabel"
              class="mt-0.5 block text-xs text-muted"
            >
              {{ row.vehicleLabel }}
            </span>
          </td>
          <td class="py-2.5 pr-3 tabular-nums">
            {{ formatScore(row.totalScore) }}
          </td>
          <td class="py-2.5 pr-3 tabular-nums">
            {{ row.rawMetrics.completedRoutes }}
          </td>
          <td class="py-2.5 pr-3 tabular-nums">
            {{ row.rawMetrics.deliveredStops }}
          </td>
          <td class="py-2.5 pr-3 tabular-nums">
            {{ formatRatePercent(row.rawMetrics.onTimeDeliveryRate) }}
          </td>
          <td class="py-2.5 pr-3 tabular-nums">
            {{ formatRatePercent(row.rawMetrics.qrConfirmationRate) }}
          </td>
          <td class="py-2.5">
            <span
              v-if="isInsufficient(row.dataCompleteness)"
              class="text-xs text-amber-700"
            >
              {{ t('admin.courierAnalytics.insufficientData') }}
            </span>
            <span v-else class="text-xs text-muted">
              {{ t('admin.courierAnalytics.eligibleData') }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import {
  formatRatePercent,
  formatScore,
  isInsufficient,
  type RankingRow,
} from '@/composables/courier-analytics-mappers'

const props = defineProps<{
  rankings: RankingRow[]
  selectedId?: string | null
}>()

const emit = defineEmits<{
  select: [courierProfileId: string]
}>()

const { t } = useI18n()

function rowClass(row: RankingRow): string {
  const classes: string[] = []
  if (row.courierProfileId === props.selectedId) {
    classes.push('bg-primary-50')
  } else if (row.rank === 1) {
    classes.push('bg-teal-50/70')
  } else if (row.rank === 2 || row.rank === 3) {
    classes.push('bg-slate-50')
  }
  if (isInsufficient(row.dataCompleteness)) {
    classes.push('opacity-80')
  }
  return classes.join(' ')
}
</script>
