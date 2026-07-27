<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import FeatureRouteVoiceReportCard from '@/components/feature/voice-report/FeatureRouteVoiceReportCard.vue'
import type { RouteVoiceReportItem } from '@/composables/voice-report/useRouteVoiceReports'

defineProps<{
  reports: readonly RouteVoiceReportItem[]
  loading: boolean
  errorMessage: string | null
  routeId: string
  showCourierName: boolean
  canRetryTranscription: boolean
  retryingReportId: string | null
  retryErrorMessage: string | null
}>()

defineEmits<{
  'retry-transcription': [reportId: string]
}>()

const { t } = useI18n()
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
      :title="t('routeVoiceReports.empty.title')"
      :description="t('routeVoiceReports.empty.description')"
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

    <ul v-if="reports.length > 0" class="space-y-3" role="list">
      <li v-for="report in reports" :key="report.id">
        <FeatureRouteVoiceReportCard
          :report="report"
          :route-id="routeId"
          :show-courier-name="showCourierName"
          :can-retry-transcription="canRetryTranscription"
          :retrying="retryingReportId === report.id"
          @retry-transcription="$emit('retry-transcription', $event)"
        />
      </li>
    </ul>
  </div>
</template>
