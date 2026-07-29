<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import CommonPageHeader from '@/components/common/CommonPageHeader.vue'
import CommonPageSection from '@/components/common/CommonPageSection.vue'
import CommonEcharts from '@/components/feature/admin/analytics/CommonEcharts.vue'
import FeatureCourierAnalyticsDetail from '@/components/feature/admin/analytics/FeatureCourierAnalyticsDetail.vue'
import FeatureCourierAnalyticsKpi from '@/components/feature/admin/analytics/FeatureCourierAnalyticsKpi.vue'
import FeatureCourierAnalyticsLeaderboard from '@/components/feature/admin/analytics/FeatureCourierAnalyticsLeaderboard.vue'
import {
  buildComponentMatrixOption,
  buildDonutOption,
  buildHandlingDurationOption,
  buildMonthlyActivityOption,
  buildScoreComparisonOption,
} from '@/components/feature/admin/analytics/courier-chart-options'
import {
  formatHandlingDuration,
  formatScore,
  isInsufficient,
} from '@/composables/courier-analytics-mappers'
import { useCourierPerformanceAnalytics } from '@/composables/useCourierPerformanceAnalytics'
import { useChartThemeRevision } from '@/composables/useChartThemeRevision'

const { t } = useI18n()
const chartThemeRevision = useChartThemeRevision()

const {
  loading,
  refreshing,
  exporting,
  errorMessage,
  exportErrorMessage,
  exportSuccessMessage,
  payload,
  generatedAtLabel,
  hasData,
  showDataQuality,
  kpiCards,
  rankings,
  scoreComparison,
  insufficientExcludedFromScoreChart,
  componentMatrix,
  monthlyActivity,
  routeStatusDistribution,
  timelinessDistribution,
  proofDistribution,
  handlingDurations,
  selectedCourier,
  selectedCourierProfileId,
  dataQuality,
  load,
  refresh,
  selectCourier,
  clearSelection,
  exportCsv,
  clearExportFeedback,
} = useCourierPerformanceAnalytics()

const dataQualityOpen = ref(false)

const generatedAtMeta = computed(() => {
  if (!generatedAtLabel.value) {
    return undefined
  }
  return `${t('admin.courierAnalytics.calculated')}: ${generatedAtLabel.value}`
})

onMounted(() => {
  void load()
})

function routeStatusLabel(key: string): string {
  const map: Record<string, string> = {
    ASSIGNED: t('admin.courierAnalytics.routeStatus.assigned'),
    IN_PROGRESS: t('admin.courierAnalytics.routeStatus.inProgress'),
    COMPLETED: t('admin.courierAnalytics.routeStatus.completed'),
    CANCELLED: t('admin.courierAnalytics.routeStatus.cancelled'),
    OVERDUE_INCOMPLETE: t(
      'admin.courierAnalytics.routeStatus.overdueIncomplete',
    ),
  }
  return map[key] ?? key
}

function timelinessLabel(key: string): string {
  const map: Record<string, string> = {
    ON_TIME: t('admin.courierAnalytics.timeliness.onTime'),
    LATE: t('admin.courierAnalytics.timeliness.late'),
    UNKNOWN: t('admin.courierAnalytics.timeliness.unknown'),
  }
  return map[key] ?? key
}

function proofLabel(key: string): string {
  const map: Record<string, string> = {
    QR: t('admin.courierAnalytics.proof.qr'),
    ADMIN: t('admin.courierAnalytics.proof.admin'),
    UNKNOWN: t('admin.courierAnalytics.proof.unknown'),
  }
  return map[key] ?? key
}

const scoreOption = computed(() => {
  void chartThemeRevision.value
  return scoreComparison.value.length > 0
    ? buildScoreComparisonOption(scoreComparison.value, t)
    : null
})

const componentOption = computed(() => {
  void chartThemeRevision.value
  return componentMatrix.value.length > 0
    ? buildComponentMatrixOption(componentMatrix.value, t)
    : null
})

const monthlyOption = computed(() => {
  void chartThemeRevision.value
  return monthlyActivity.value.length > 0
    ? buildMonthlyActivityOption(monthlyActivity.value, t)
    : null
})

const routeDonutOption = computed(() => {
  void chartThemeRevision.value
  return routeStatusDistribution.value.some(s => s.count > 0)
    ? buildDonutOption(routeStatusDistribution.value, routeStatusLabel, t)
    : null
})

const timelinessDonutOption = computed(() => {
  void chartThemeRevision.value
  return timelinessDistribution.value.some(s => s.count > 0)
    ? buildDonutOption(timelinessDistribution.value, timelinessLabel, t)
    : null
})

const proofDonutOption = computed(() => {
  void chartThemeRevision.value
  return proofDistribution.value.some(s => s.count > 0)
    ? buildDonutOption(proofDistribution.value, proofLabel, t)
    : null
})

const handlingOption = computed(() => {
  void chartThemeRevision.value
  return handlingDurations.value.length > 0
    ? buildHandlingDurationOption(handlingDurations.value, t)
    : null
})

function onChartSelect(payload: { courierProfileId?: string }): void {
  if (payload.courierProfileId) {
    selectCourier(payload.courierProfileId)
  }
}

function onSelectCourier(id: string): void {
  selectCourier(id)
}

async function onExportCsv(): Promise<void> {
  await exportCsv()
}
</script>

<template>
  <div class="space-y-8" data-testid="courier-analytics-page">
    <CommonPageHeader
      :title="t('admin.courierAnalytics.title')"
      :subtitle="t('admin.courierAnalytics.subtitle')"
      :meta="generatedAtMeta"
    >
      <template #actions>
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          :loading="refreshing"
          :disabled="loading || refreshing"
          :aria-label="t('admin.courierAnalytics.refresh')"
          data-testid="courier-analytics-refresh"
          @click="refresh()"
        >
          {{ t('admin.courierAnalytics.refresh') }}
        </UButton>
        <UButton
          color="primary"
          size="sm"
          :loading="exporting"
          :disabled="exporting || !hasData"
          :aria-label="t('admin.courierAnalytics.exportCsv')"
          data-testid="courier-analytics-export"
          @click="onExportCsv"
        >
          {{ t('admin.courierAnalytics.exportCsv') }}
        </UButton>
      </template>
    </CommonPageHeader>

    <div
      v-if="exportSuccessMessage || exportErrorMessage"
      class="space-y-2"
      aria-live="polite"
    >
      <UAlert
        v-if="exportSuccessMessage"
        color="success"
        variant="subtle"
        :title="exportSuccessMessage"
      />
      <UAlert
        v-if="exportErrorMessage"
        color="error"
        variant="subtle"
        :title="exportErrorMessage"
      />
      <UButton
        v-if="exportSuccessMessage || exportErrorMessage"
        size="xs"
        variant="ghost"
        color="neutral"
        @click="clearExportFeedback()"
      >
        {{ t('common.close') }}
      </UButton>
    </div>

    <div v-if="loading" class="space-y-6" aria-busy="true">
      <div class="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <CommonLoadingSkeleton v-for="n in 6" :key="n" />
      </div>
      <CommonLoadingSkeleton />
      <CommonLoadingSkeleton />
    </div>

    <div v-else-if="errorMessage" class="space-y-3" role="alert">
      <CommonErrorState
        :title="t('admin.courierAnalytics.error.title')"
        :description="errorMessage"
      />
      <UButton
        color="primary"
        size="sm"
        data-testid="courier-analytics-retry"
        @click="load()"
      >
        {{ t('admin.courierAnalytics.retry') }}
      </UButton>
    </div>

    <template v-else-if="payload">
      <UAlert
        v-if="!hasData"
        color="neutral"
        variant="subtle"
        icon="i-lucide-info"
        :title="t('admin.courierAnalytics.noData.title')"
        :description="t('admin.courierAnalytics.noData.description')"
        data-testid="courier-analytics-no-data"
      />

      <CommonPageSection
        v-if="hasData"
        :title="t('admin.courierAnalytics.section.summary')"
      >
        <FeatureCourierAnalyticsKpi :cards="kpiCards" />
      </CommonPageSection>

      <CommonPageSection v-if="showDataQuality" variant="inset">
        <button
          type="button"
          class="flex w-full items-center justify-between text-left outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary"
          :aria-expanded="dataQualityOpen"
          data-testid="courier-analytics-data-quality-toggle"
          @click="dataQualityOpen = !dataQualityOpen"
        >
          <div>
            <h2 class="text-sm font-semibold text-highlighted">
              {{ t('admin.courierAnalytics.dataQuality.title') }}
            </h2>
            <p class="mt-0.5 text-xs text-muted">
              {{ t('admin.courierAnalytics.dataQuality.summary') }}
            </p>
          </div>
          <UIcon
            :name="
              dataQualityOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
            "
            class="size-4 text-muted"
            aria-hidden="true"
          />
        </button>
        <div
          v-if="dataQualityOpen && dataQuality"
          class="mt-4 grid gap-2 text-sm sm:grid-cols-2"
          data-testid="courier-analytics-data-quality"
        >
          <p>
            {{ t('admin.courierAnalytics.dataQuality.legacyRoutes') }}:
            <span class="tabular-nums font-medium">
              {{ dataQuality.legacyRoutesWithoutRequiredFields }}
            </span>
          </p>
          <p>
            {{ t('admin.courierAnalytics.dataQuality.missingTimestamps') }}:
            <span class="tabular-nums font-medium">
              {{ dataQuality.deliveredStopsWithoutTimestamp }}
            </span>
          </p>
          <p>
            {{ t('admin.courierAnalytics.dataQuality.invalidSequences') }}:
            <span class="tabular-nums font-medium">
              {{ dataQuality.invalidStopSequences }}
            </span>
          </p>
          <p>
            {{ t('admin.courierAnalytics.dataQuality.missingOrders') }}:
            <span class="tabular-nums font-medium">
              {{ dataQuality.missingOrders }}
            </span>
          </p>
          <p>
            {{ t('admin.courierAnalytics.dataQuality.invalidHandling') }}:
            <span class="tabular-nums font-medium">
              {{ dataQuality.invalidHandlingDurations }}
            </span>
          </p>
          <p>
            {{ t('admin.courierAnalytics.dataQuality.malformedProofs') }}:
            <span class="tabular-nums font-medium">
              {{ dataQuality.malformedProofs }}
            </span>
          </p>
          <p class="sm:col-span-2 text-xs text-muted">
            {{ t('admin.courierAnalytics.dataQuality.exclusionNote') }}
          </p>
        </div>
      </CommonPageSection>

      <template v-if="hasData">
        <CommonPageSection
          :title="t('admin.courierAnalytics.leaderboard.title')"
          :description="t('admin.courierAnalytics.leaderboard.subtitle')"
        >
          <FeatureCourierAnalyticsLeaderboard
            :rankings="rankings"
            :selected-id="selectedCourierProfileId"
            @select="onSelectCourier"
          />
        </CommonPageSection>

        <FeatureCourierAnalyticsDetail
          :courier="selectedCourier"
          @close="clearSelection"
        />

        <CommonPageSection
          :title="t('admin.courierAnalytics.charts.scoreComparison.title')"
          :description="
            t('admin.courierAnalytics.charts.scoreComparison.subtitle')
          "
        >
          <CommonEcharts
            :option="scoreOption"
            :caption="
              insufficientExcludedFromScoreChart > 0
                ? t(
                    'admin.courierAnalytics.charts.scoreComparison.excludedNote',
                    {
                      count: insufficientExcludedFromScoreChart,
                    },
                  )
                : t('admin.courierAnalytics.charts.scoreComparison.caption')
            "
            :empty="!scoreOption"
            :empty-title="t('admin.courierAnalytics.charts.empty.title')"
            :empty-description="
              t('admin.courierAnalytics.charts.empty.description')
            "
            :min-height="Math.max(280, scoreComparison.length * 36)"
            @chart-click="onChartSelect"
          />
        </CommonPageSection>

        <CommonPageSection
          :title="t('admin.courierAnalytics.charts.components.title')"
          :description="t('admin.courierAnalytics.charts.components.subtitle')"
        >
          <CommonEcharts
            :option="componentOption"
            :caption="t('admin.courierAnalytics.charts.components.caption')"
            :empty="!componentOption"
            :empty-title="t('admin.courierAnalytics.charts.empty.title')"
            :empty-description="
              t('admin.courierAnalytics.charts.empty.description')
            "
            :min-height="Math.max(300, componentMatrix.length * 48)"
            @chart-click="onChartSelect"
          />
        </CommonPageSection>

        <CommonPageSection
          :title="t('admin.courierAnalytics.charts.monthlyActivity.title')"
          :description="
            t('admin.courierAnalytics.charts.monthlyActivity.subtitle')
          "
        >
          <CommonEcharts
            :option="monthlyOption"
            :caption="
              t('admin.courierAnalytics.charts.monthlyActivity.caption')
            "
            :empty="!monthlyOption"
            :empty-title="t('admin.courierAnalytics.charts.empty.title')"
            :empty-description="
              t('admin.courierAnalytics.charts.empty.description')
            "
            :min-height="320"
          />
          <div class="mt-3 overflow-x-auto">
            <table class="w-full min-w-md text-left text-xs">
              <caption class="sr-only">
                {{
                  t('admin.courierAnalytics.charts.monthlyActivity.title')
                }}
              </caption>
              <thead>
                <tr class="border-b border-default bg-muted text-toned">
                  <th scope="col" class="px-2 py-1.5 font-medium">
                    {{ t('admin.courierAnalytics.column.month') }}
                  </th>
                  <th scope="col" class="px-2 py-1.5 font-medium">
                    {{ t('admin.courierAnalytics.series.deliveredStops') }}
                  </th>
                  <th scope="col" class="px-2 py-1.5 font-medium">
                    {{ t('admin.courierAnalytics.series.completedRoutes') }}
                  </th>
                  <th scope="col" class="px-2 py-1.5 font-medium">
                    {{ t('admin.courierAnalytics.series.deliveredOrders') }}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr v-for="row in monthlyActivity" :key="row.month">
                  <td class="px-2 py-1.5 tabular-nums">{{ row.month }}</td>
                  <td class="px-2 py-1.5 tabular-nums">
                    {{ row.deliveredStops }}
                  </td>
                  <td class="px-2 py-1.5 tabular-nums">
                    {{ row.completedRoutes }}
                  </td>
                  <td class="px-2 py-1.5 tabular-nums">
                    {{ row.deliveredOrders }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CommonPageSection>

        <CommonPageSection
          :title="t('admin.courierAnalytics.section.distributions')"
        >
          <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <CommonEcharts
              :option="routeDonutOption"
              :title="t('admin.courierAnalytics.charts.routeStatus.title')"
              :subtitle="
                t('admin.courierAnalytics.charts.routeStatus.subtitle')
              "
              :empty="!routeDonutOption"
              :empty-title="t('admin.courierAnalytics.charts.empty.title')"
              :empty-description="
                t('admin.courierAnalytics.charts.empty.description')
              "
              :min-height="260"
            />
            <CommonEcharts
              :option="timelinessDonutOption"
              :title="t('admin.courierAnalytics.charts.timeliness.title')"
              :subtitle="t('admin.courierAnalytics.charts.timeliness.subtitle')"
              :empty="!timelinessDonutOption"
              :empty-title="t('admin.courierAnalytics.charts.empty.title')"
              :empty-description="
                t('admin.courierAnalytics.charts.empty.description')
              "
              :min-height="260"
            />
            <CommonEcharts
              :option="proofDonutOption"
              :title="t('admin.courierAnalytics.charts.proof.title')"
              :subtitle="t('admin.courierAnalytics.charts.proof.subtitle')"
              :empty="!proofDonutOption"
              :empty-title="t('admin.courierAnalytics.charts.empty.title')"
              :empty-description="
                t('admin.courierAnalytics.charts.empty.description')
              "
              :min-height="260"
            />
          </div>
        </CommonPageSection>

        <CommonPageSection
          :title="t('admin.courierAnalytics.charts.handling.title')"
          :description="t('admin.courierAnalytics.charts.handling.subtitle')"
        >
          <CommonEcharts
            :option="handlingOption"
            :caption="t('admin.courierAnalytics.handling.contextNote')"
            :empty="!handlingOption"
            :empty-title="
              t('admin.courierAnalytics.charts.handling.emptyTitle')
            "
            :empty-description="
              t('admin.courierAnalytics.charts.handling.emptyDescription')
            "
            :min-height="Math.max(260, handlingDurations.length * 36)"
            @chart-click="onChartSelect"
          />
        </CommonPageSection>

        <CommonPageSection
          :title="t('admin.courierAnalytics.detailTable.title')"
          :description="t('admin.courierAnalytics.detailTable.subtitle')"
        >
          <template #actions>
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              :loading="exporting"
              :disabled="exporting"
              data-testid="courier-analytics-export-detail"
              @click="onExportCsv"
            >
              {{ t('admin.courierAnalytics.exportCsv') }}
            </UButton>
          </template>
          <div class="overflow-x-auto">
            <table class="w-full min-w-5xl text-left text-sm">
              <caption class="sr-only">
                {{
                  t('admin.courierAnalytics.detailTable.caption')
                }}
              </caption>
              <thead>
                <tr
                  class="border-b border-default bg-muted text-xs uppercase tracking-wide text-toned"
                >
                  <th scope="col" class="sticky left-0 bg-muted px-2 py-2">
                    {{ t('admin.courierAnalytics.column.rank') }}
                  </th>
                  <th scope="col" class="sticky left-10 bg-muted px-2 py-2">
                    {{ t('admin.courierAnalytics.column.courier') }}
                  </th>
                  <th scope="col" class="px-2 py-2">
                    {{ t('admin.courierAnalytics.reliabilityScore') }}
                  </th>
                  <th scope="col" class="px-2 py-2">
                    {{ t('admin.courierAnalytics.component.routeCompletion') }}
                  </th>
                  <th scope="col" class="px-2 py-2">
                    {{
                      t('admin.courierAnalytics.component.deliveryCompletion')
                    }}
                  </th>
                  <th scope="col" class="px-2 py-2">
                    {{ t('admin.courierAnalytics.component.onTime') }}
                  </th>
                  <th scope="col" class="px-2 py-2">
                    {{ t('admin.courierAnalytics.component.qrConfirmation') }}
                  </th>
                  <th scope="col" class="px-2 py-2">
                    {{ t('admin.courierAnalytics.component.consistency') }}
                  </th>
                  <th scope="col" class="px-2 py-2">
                    {{ t('admin.courierAnalytics.column.assignedRoutes') }}
                  </th>
                  <th scope="col" class="px-2 py-2">
                    {{ t('admin.courierAnalytics.column.completedRoutes') }}
                  </th>
                  <th scope="col" class="px-2 py-2">
                    {{ t('admin.courierAnalytics.column.overdueRoutes') }}
                  </th>
                  <th scope="col" class="px-2 py-2">
                    {{ t('admin.courierAnalytics.column.deliveredStops') }}
                  </th>
                  <th scope="col" class="px-2 py-2">
                    {{ t('admin.courierAnalytics.detail.lateStops') }}
                  </th>
                  <th scope="col" class="px-2 py-2">
                    {{ t('admin.courierAnalytics.detail.qrConfirmedStops') }}
                  </th>
                  <th scope="col" class="px-2 py-2">
                    {{ t('admin.courierAnalytics.averageHandlingDuration') }}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr
                  v-for="row in rankings"
                  :key="row.courierProfileId"
                  class="cursor-pointer hover:bg-muted/60"
                  @click="onSelectCourier(row.courierProfileId)"
                >
                  <td class="sticky left-0 bg-default px-2 py-2 tabular-nums">
                    {{ row.rank }}
                  </td>
                  <td class="sticky left-10 bg-default px-2 py-2 font-medium">
                    {{ row.displayName }}
                    <span
                      v-if="isInsufficient(row.dataCompleteness)"
                      class="ml-1 text-xs font-medium text-warning"
                    >
                      ({{ t('admin.courierAnalytics.insufficientData') }})
                    </span>
                  </td>
                  <td class="px-2 py-2 tabular-nums">
                    {{ formatScore(row.totalScore) }}
                  </td>
                  <td class="px-2 py-2 tabular-nums">
                    {{ formatScore(row.componentScores.routeCompletion) }}
                  </td>
                  <td class="px-2 py-2 tabular-nums">
                    {{ formatScore(row.componentScores.deliveryCompletion) }}
                  </td>
                  <td class="px-2 py-2 tabular-nums">
                    {{ formatScore(row.componentScores.onTime) }}
                  </td>
                  <td class="px-2 py-2 tabular-nums">
                    {{ formatScore(row.componentScores.qrConfirmation) }}
                  </td>
                  <td class="px-2 py-2 tabular-nums">
                    {{
                      formatScore(row.componentScores.operationalConsistency)
                    }}
                  </td>
                  <td class="px-2 py-2 tabular-nums">
                    {{ row.rawMetrics.totalAssignedRoutes }}
                  </td>
                  <td class="px-2 py-2 tabular-nums">
                    {{ row.rawMetrics.completedRoutes }}
                  </td>
                  <td class="px-2 py-2 tabular-nums">
                    {{ row.rawMetrics.incompleteRoutes }}
                  </td>
                  <td class="px-2 py-2 tabular-nums">
                    {{ row.rawMetrics.deliveredStops }}
                  </td>
                  <td class="px-2 py-2 tabular-nums">
                    {{ row.rawMetrics.lateDeliveredStops }}
                  </td>
                  <td class="px-2 py-2 tabular-nums">
                    {{ row.rawMetrics.qrConfirmedStops }}
                  </td>
                  <td class="px-2 py-2 tabular-nums">
                    {{
                      formatHandlingDuration(
                        row.rawMetrics.averageHandlingDurationSeconds,
                      )
                    }}
                    <span
                      v-if="row.rawMetrics.handlingDurationSampleCount > 0"
                      class="text-xs text-muted"
                    >
                      (n={{ row.rawMetrics.handlingDurationSampleCount }})
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CommonPageSection>
      </template>
    </template>

    <CommonEmptyState
      v-else
      :title="t('admin.courierAnalytics.noData.title')"
      :description="t('admin.courierAnalytics.noData.description')"
    />
  </div>
</template>
