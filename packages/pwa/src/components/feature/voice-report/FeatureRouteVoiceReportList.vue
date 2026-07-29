<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import FeatureRouteVoiceReportCard from '@/components/feature/voice-report/FeatureRouteVoiceReportCard.vue'
import {
  isLegacyRouteVoiceReport,
  type RouteVoiceReportItem,
} from '@/composables/voice-report/useRouteVoiceReports'

const props = withDefaults(
  defineProps<{
    reports: readonly RouteVoiceReportItem[]
    loading: boolean
    errorMessage: string | null
    routeId: string
    showCourierName: boolean
    canRetryTranscription: boolean
    retryingReportId: string | null
    retryErrorMessage: string | null
    /** Show stop/pharmacy/legacy badge on each card. */
    showStopContext?: boolean
    /** Group reports into per-stop sections + legacy (admin route-all). */
    groupByStop?: boolean
    emptyTitleKey?: string
    emptyDescriptionKey?: string
  }>(),
  {
    showStopContext: false,
    groupByStop: false,
    emptyTitleKey: 'routeVoiceReports.empty.title',
    emptyDescriptionKey: 'routeVoiceReports.empty.description',
  },
)

defineEmits<{
  'retry-transcription': [reportId: string]
}>()

const { t } = useI18n()

type ReportGroup = {
  key: string
  title: string
  reports: RouteVoiceReportItem[]
  isLegacy: boolean
}

const reportGroups = computed((): ReportGroup[] | null => {
  if (!props.groupByStop) {
    return null
  }

  const stopGroups = new Map<string, ReportGroup>()
  const legacy: RouteVoiceReportItem[] = []

  for (const report of props.reports) {
    if (isLegacyRouteVoiceReport(report)) {
      legacy.push(report)
      continue
    }
    const stopId = report.stopId as string
    let group = stopGroups.get(stopId)
    if (!group) {
      const sequence = report.stopSequence
      const pharmacy = report.pharmacyDisplayName
      const title =
        sequence != null && pharmacy
          ? t('routeVoiceReports.stop.stopContext', {
              sequence,
              pharmacy,
            })
          : (pharmacy ??
            (sequence != null
              ? t('bezorger.route.stop.label', { sequence })
              : stopId))
      group = {
        key: stopId,
        title,
        reports: [],
        isLegacy: false,
      }
      stopGroups.set(stopId, group)
    }
    group.reports.push(report)
  }

  const groups = Array.from(stopGroups.values()).sort((a, b) => {
    const seqA = a.reports[0]?.stopSequence ?? Number.MAX_SAFE_INTEGER
    const seqB = b.reports[0]?.stopSequence ?? Number.MAX_SAFE_INTEGER
    return seqA - seqB
  })

  if (legacy.length > 0) {
    groups.push({
      key: 'legacy',
      title: t('routeVoiceReports.stop.legacyTitle'),
      reports: legacy,
      isLegacy: true,
    })
  }

  return groups
})
</script>

<template>
  <div class="space-y-3" data-testid="route-voice-report-list">
    <CommonLoadingSkeleton v-if="loading && reports.length === 0" />

    <CommonErrorState
      v-else-if="errorMessage && reports.length === 0"
      :title="t('routeVoiceReports.loadFailed')"
      :description="errorMessage"
    />

    <CommonEmptyState
      v-else-if="!loading && reports.length === 0"
      :title="t(emptyTitleKey)"
      :description="t(emptyDescriptionKey)"
      data-testid="route-voice-reports-empty"
    />

    <UAlert
      v-if="retryErrorMessage"
      color="error"
      variant="subtle"
      role="alert"
      data-testid="route-voice-retry-error"
      :title="retryErrorMessage"
    />

    <template v-if="reports.length > 0 && reportGroups">
      <section
        v-for="group in reportGroups"
        :key="group.key"
        class="space-y-2"
        :data-testid="
          group.isLegacy
            ? 'route-voice-report-group-legacy'
            : `route-voice-report-group-${group.key}`
        "
      >
        <h3 class="text-sm font-semibold text-highlighted">
          {{ group.title }}
        </h3>
        <ul class="divide-y divide-default" role="list">
          <li
            v-for="report in group.reports"
            :key="report.id"
            class="py-3 first:pt-0 last:pb-0"
          >
            <FeatureRouteVoiceReportCard
              :report="report"
              :route-id="routeId"
              :show-courier-name="showCourierName"
              :show-stop-context="showStopContext"
              :can-retry-transcription="canRetryTranscription"
              :retrying="retryingReportId === report.id"
              @retry-transcription="$emit('retry-transcription', $event)"
            />
          </li>
        </ul>
      </section>
    </template>

    <ul
      v-else-if="reports.length > 0"
      class="divide-y divide-default"
      role="list"
    >
      <li
        v-for="report in reports"
        :key="report.id"
        class="py-3 first:pt-0 last:pb-0"
      >
        <FeatureRouteVoiceReportCard
          :report="report"
          :route-id="routeId"
          :show-courier-name="showCourierName"
          :show-stop-context="showStopContext"
          :can-retry-transcription="canRetryTranscription"
          :retrying="retryingReportId === report.id"
          @retry-transcription="$emit('retry-transcription', $event)"
        />
      </li>
    </ul>
  </div>
</template>
