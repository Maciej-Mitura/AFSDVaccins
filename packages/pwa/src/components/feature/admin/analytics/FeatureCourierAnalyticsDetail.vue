<template>
  <UCard
    v-if="courier"
    data-testid="courier-analytics-detail"
    :ui="{ body: 'p-4 sm:p-5' }"
  >
    <div class="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">
          {{ courier.displayName }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ t('admin.courierAnalytics.column.rank') }} {{ courier.rank }}
          ·
          <span v-if="isInsufficient(courier.dataCompleteness)">
            {{ t('admin.courierAnalytics.insufficientData') }}
          </span>
          <span v-else>{{ t('admin.courierAnalytics.eligibleData') }}</span>
        </p>
      </div>
      <UButton
        size="sm"
        color="neutral"
        variant="ghost"
        :aria-label="t('common.close')"
        data-testid="courier-analytics-detail-close"
        @click="emit('close')"
      >
        {{ t('common.close') }}
      </UButton>
    </div>

    <div class="space-y-5">
      <div>
        <p class="text-xs uppercase tracking-wide text-muted">
          {{ t('admin.courierAnalytics.reliabilityScore') }}
        </p>
        <p class="text-3xl font-semibold tabular-nums">
          {{ formatScore(courier.totalScore) }}
        </p>
      </div>

      <section aria-labelledby="detail-components-heading">
        <h3 id="detail-components-heading" class="mb-2 text-sm font-semibold">
          {{ t('admin.courierAnalytics.componentBreakdown') }}
        </h3>
        <ul class="space-y-3">
          <li v-for="item in componentItems" :key="item.key" class="space-y-1">
            <div class="flex justify-between text-sm">
              <span>{{ item.label }}</span>
              <span class="tabular-nums text-muted">
                {{ formatScore(item.score) }}
                <span class="text-xs">
                  ({{ t('admin.courierAnalytics.weightedContribution') }}:
                  {{ formatScore(item.weighted) }})
                </span>
              </span>
            </div>
            <div
              class="h-2 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              :aria-valuenow="item.score"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-label="item.label"
            >
              <div
                class="h-full rounded-full bg-teal-600"
                :style="{
                  width: `${Math.min(100, Math.max(0, item.score))}%`,
                }"
              />
            </div>
          </li>
        </ul>
      </section>

      <section
        aria-labelledby="detail-raw-heading"
        class="grid gap-3 sm:grid-cols-2"
      >
        <h3 id="detail-raw-heading" class="sr-only">
          {{ t('admin.courierAnalytics.detail.rawMetrics') }}
        </h3>
        <div>
          <h4
            class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted"
          >
            {{ t('admin.courierAnalytics.detail.routeMetrics') }}
          </h4>
          <dl class="space-y-1 text-sm">
            <div class="flex justify-between gap-2">
              <dt>{{ t('admin.courierAnalytics.column.assignedRoutes') }}</dt>
              <dd class="tabular-nums">{{ m.totalAssignedRoutes }}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt>{{ t('admin.courierAnalytics.column.completedRoutes') }}</dt>
              <dd class="tabular-nums">{{ m.completedRoutes }}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt>{{ t('admin.courierAnalytics.column.overdueRoutes') }}</dt>
              <dd class="tabular-nums">{{ m.incompleteRoutes }}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt>
                {{ t('admin.courierAnalytics.component.routeCompletion') }}
              </dt>
              <dd class="tabular-nums">
                {{ formatRatePercent(m.routeCompletionRate) }}
              </dd>
            </div>
          </dl>
        </div>
        <div>
          <h4
            class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted"
          >
            {{ t('admin.courierAnalytics.detail.stopMetrics') }}
          </h4>
          <dl class="space-y-1 text-sm">
            <div class="flex justify-between gap-2">
              <dt>{{ t('admin.courierAnalytics.column.deliveredStops') }}</dt>
              <dd class="tabular-nums">{{ m.deliveredStops }}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt>{{ t('admin.courierAnalytics.detail.onTimeStops') }}</dt>
              <dd class="tabular-nums">{{ m.onTimeDeliveredStops }}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt>{{ t('admin.courierAnalytics.detail.lateStops') }}</dt>
              <dd class="tabular-nums">{{ m.lateDeliveredStops }}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt>
                {{ t('admin.courierAnalytics.detail.qrConfirmedStops') }}
              </dt>
              <dd class="tabular-nums">{{ m.qrConfirmedStops }}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section aria-labelledby="detail-consistency-heading">
        <h3 id="detail-consistency-heading" class="mb-2 text-sm font-semibold">
          {{ t('admin.courierAnalytics.component.consistency') }}
        </h3>
        <dl class="space-y-1 text-sm">
          <div class="flex justify-between gap-2">
            <dt>
              {{ t('admin.courierAnalytics.consistency.overdueIncomplete') }}
            </dt>
            <dd class="tabular-nums">{{ c.overdueIncompleteRoutes }}</dd>
          </div>
          <div class="flex justify-between gap-2">
            <dt>
              {{ t('admin.courierAnalytics.consistency.abandonedProcessing') }}
            </dt>
            <dd class="tabular-nums">
              {{ c.abandonedProcessingConfirmations }}
            </dd>
          </div>
          <div class="flex justify-between gap-2">
            <dt>
              {{ t('admin.courierAnalytics.consistency.invalidProofs') }}
            </dt>
            <dd class="tabular-nums">{{ c.invalidOrIncompleteProofs }}</dd>
          </div>
        </dl>
        <p class="mt-2 text-xs text-muted">
          {{ t('admin.courierAnalytics.consistency.explanation') }}
        </p>
      </section>

      <section aria-labelledby="detail-handling-heading">
        <h3 id="detail-handling-heading" class="mb-2 text-sm font-semibold">
          {{ t('admin.courierAnalytics.handlingTime') }}
        </h3>
        <dl class="space-y-1 text-sm">
          <div class="flex justify-between gap-2">
            <dt>
              {{ t('admin.courierAnalytics.averageHandlingDuration') }}
            </dt>
            <dd class="tabular-nums">
              {{ formatHandlingDuration(m.averageHandlingDurationSeconds) }}
            </dd>
          </div>
          <div class="flex justify-between gap-2">
            <dt>
              {{ t('admin.courierAnalytics.medianHandlingDuration') }}
            </dt>
            <dd class="tabular-nums">
              {{ formatHandlingDuration(m.medianHandlingDurationSeconds) }}
            </dd>
          </div>
          <div class="flex justify-between gap-2">
            <dt>{{ t('admin.courierAnalytics.sampleCount') }}</dt>
            <dd class="tabular-nums">{{ m.handlingDurationSampleCount }}</dd>
          </div>
        </dl>
        <p class="mt-2 text-xs text-muted">
          {{ t('admin.courierAnalytics.handling.contextNote') }}
        </p>
      </section>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  formatHandlingDuration,
  formatRatePercent,
  formatScore,
  isInsufficient,
  type DetailPanelVm,
} from '@/composables/courier-analytics-mappers'

const props = defineProps<{
  courier: DetailPanelVm | null
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()

const m = computed(() => props.courier!.rawMetrics)
const c = computed(() => props.courier!.consistencyIssueBreakdown)

const componentItems = computed(() => {
  if (!props.courier) return []
  const scores = props.courier.componentScores
  const weighted = props.courier.weightedContributions
  return [
    {
      key: 'routeCompletion',
      label: t('admin.courierAnalytics.component.routeCompletion'),
      score: scores.routeCompletion,
      weighted: weighted.routeCompletion,
    },
    {
      key: 'deliveryCompletion',
      label: t('admin.courierAnalytics.component.deliveryCompletion'),
      score: scores.deliveryCompletion,
      weighted: weighted.deliveryCompletion,
    },
    {
      key: 'onTime',
      label: t('admin.courierAnalytics.component.onTime'),
      score: scores.onTime,
      weighted: weighted.onTime,
    },
    {
      key: 'qrConfirmation',
      label: t('admin.courierAnalytics.component.qrConfirmation'),
      score: scores.qrConfirmation,
      weighted: weighted.qrConfirmation,
    },
    {
      key: 'operationalConsistency',
      label: t('admin.courierAnalytics.component.consistency'),
      score: scores.operationalConsistency,
      weighted: weighted.operationalConsistency,
    },
  ]
})
</script>
