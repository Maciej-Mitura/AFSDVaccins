<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { mapTranscriptionFailureCode } from '@/api/route-voice-report-errors'
import { useAuthenticatedAudioSource } from '@/composables/voice-report/useAuthenticatedAudioSource'
import { formatDurationSeconds } from '@/composables/voice-report/voice-recorder-types'
import {
  isLegacyRouteVoiceReport,
  type RouteVoiceReportItem,
} from '@/composables/voice-report/useRouteVoiceReports'
import { formatDateTime } from '@/i18n'

const props = withDefaults(
  defineProps<{
    report: RouteVoiceReportItem
    routeId: string
    showCourierName: boolean
    canRetryTranscription: boolean
    retrying: boolean
    /** Show stop/pharmacy context and legacy badge (admin). */
    showStopContext?: boolean
  }>(),
  {
    showStopContext: false,
  },
)

const emit = defineEmits<{
  'retry-transcription': [reportId: string]
}>()

const { t } = useI18n()
const audio = useAuthenticatedAudioSource()

const durationLabel = computed(() =>
  formatDurationSeconds(props.report.effectiveDurationSeconds),
)

const statusBadgeColor = computed(() => {
  const status = String(props.report.transcriptionStatus ?? '')
  if (status === 'COMPLETED') {
    return 'success'
  }
  if (status === 'FAILED') {
    return 'error'
  }
  if (status === 'PROCESSING') {
    return 'warning'
  }
  return 'neutral'
})

const transcriptionStatusLabel = computed(() => {
  const status = String(props.report.transcriptionStatus ?? '')
  if (status === 'PENDING') {
    return t('routeVoiceReports.transcription.pending')
  }
  if (status === 'PROCESSING') {
    return t('routeVoiceReports.transcription.processing')
  }
  if (status === 'COMPLETED') {
    return t('routeVoiceReports.transcription.completed')
  }
  if (status === 'FAILED') {
    return t('routeVoiceReports.transcription.failed')
  }
  return t('routeVoiceReports.transcription.pending')
})

function localeDisplay(locale: string | null | undefined): string {
  if (!locale) {
    return t('routeVoiceReports.language.automatic')
  }
  const normalised = String(locale).replace('_', '-')
  if (normalised === 'en-GB' || normalised === 'EN_GB') {
    return t('routeVoiceReports.language.english')
  }
  if (normalised === 'nl-NL' || normalised === 'NL_NL') {
    return t('routeVoiceReports.language.dutch')
  }
  if (normalised === 'pl-PL' || normalised === 'PL_PL') {
    return t('routeVoiceReports.language.polish')
  }
  if (normalised === 'AUTO') {
    return t('routeVoiceReports.language.automatic')
  }
  return normalised
}

const failureExplanation = computed(() =>
  mapTranscriptionFailureCode(props.report.transcriptionFailureCode),
)

const confidenceLabel = computed(() => {
  if (
    props.report.confidence === null ||
    props.report.confidence === undefined
  ) {
    return null
  }
  const pct = Math.round(props.report.confidence * 100)
  return t('routeVoiceReports.transcription.confidenceValue', { value: pct })
})

const showRetry = computed(() => {
  const status = String(props.report.transcriptionStatus ?? '')
  return (
    props.canRetryTranscription &&
    props.report.canRetryTranscription &&
    status === 'FAILED'
  )
})

const isLegacy = computed(() => isLegacyRouteVoiceReport(props.report))

const stopContextLabel = computed(() => {
  if (!props.showStopContext || isLegacy.value) {
    return null
  }
  const sequence = props.report.stopSequence
  const pharmacy = props.report.pharmacyDisplayName
  if (sequence != null && pharmacy) {
    return t('routeVoiceReports.stop.stopContext', { sequence, pharmacy })
  }
  return pharmacy ?? null
})

async function onLoadRecording(): Promise<void> {
  await audio.load(props.routeId, props.report.id)
}

watch(
  () => props.report.id,
  () => {
    audio.clear()
  },
)
</script>

<template>
  <article
    class="space-y-3"
    :data-testid="`route-voice-report-card-${report.sequenceNumber}`"
  >
    <header class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 class="font-semibold">
          {{
            t('routeVoiceReports.reportNumber', {
              number: report.sequenceNumber,
            })
          }}
        </h3>
        <p class="text-sm text-muted">
          {{ formatDateTime(report.clientRecordedAt) }}
        </p>
        <p
          v-if="stopContextLabel"
          class="text-sm text-toned"
          data-testid="route-voice-report-stop-context"
        >
          {{ stopContextLabel }}
        </p>
        <p
          v-if="showCourierName"
          class="text-sm"
          data-testid="route-voice-report-courier"
        >
          {{ report.recordedByDisplayName }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UBadge
          v-if="showStopContext && isLegacy"
          color="neutral"
          variant="subtle"
          data-testid="route-voice-legacy-badge"
        >
          {{ t('routeVoiceReports.stop.legacyTitle') }}
        </UBadge>
        <UBadge
          :color="statusBadgeColor"
          variant="subtle"
          data-testid="route-voice-transcription-badge"
        >
          {{ transcriptionStatusLabel }}
        </UBadge>
      </div>
    </header>

    <p class="text-sm text-muted">
      {{ t('routeVoiceReports.preview.duration') }}: {{ durationLabel }}
      ·
      {{ t('routeVoiceReports.uploadedAt') }}:
      {{ formatDateTime(report.uploadedAt) }}
    </p>

    <div
      v-if="report.canPlayAudio"
      class="space-y-2"
      data-testid="route-voice-playback"
    >
      <UButton
        v-if="!audio.objectUrl.value"
        size="sm"
        color="neutral"
        variant="soft"
        class="min-h-11"
        data-testid="route-voice-load-recording"
        :loading="audio.loading.value"
        :disabled="audio.loading.value"
        :aria-label="
          t('routeVoiceReports.playback.loadAria', {
            number: report.sequenceNumber,
          })
        "
        @click="onLoadRecording"
      >
        {{
          audio.loading.value
            ? t('routeVoiceReports.playback.loading')
            : t('routeVoiceReports.playback.load')
        }}
      </UButton>

      <audio
        v-if="audio.objectUrl.value"
        controls
        preload="metadata"
        class="w-full max-w-full"
        :src="audio.objectUrl.value"
        :aria-label="
          t('routeVoiceReports.playback.playAria', {
            number: report.sequenceNumber,
          })
        "
        data-testid="route-voice-audio-player"
      />

      <UAlert
        v-if="audio.errorMessage.value"
        color="error"
        variant="subtle"
        role="alert"
        data-testid="route-voice-playback-error"
        :title="audio.errorMessage.value"
      />
    </div>

    <section
      class="space-y-2"
      :aria-labelledby="`route-voice-transcript-heading-${report.id}`"
      data-testid="route-voice-transcription"
    >
      <h4
        :id="`route-voice-transcript-heading-${report.id}`"
        class="text-sm font-medium"
      >
        {{ t('routeVoiceReports.transcription.transcript') }}
      </h4>

      <p
        v-if="
          String(report.transcriptionStatus ?? '') === 'PENDING' ||
          !report.transcriptionStatus
        "
        class="text-sm text-muted"
        role="status"
      >
        {{ t('routeVoiceReports.transcription.pending') }}
      </p>

      <p
        v-else-if="String(report.transcriptionStatus ?? '') === 'PROCESSING'"
        class="text-sm text-muted"
        role="status"
      >
        {{ t('routeVoiceReports.transcription.processing') }}
      </p>

      <template
        v-else-if="String(report.transcriptionStatus ?? '') === 'COMPLETED'"
      >
        <p class="text-xs text-muted">
          {{ t('routeVoiceReports.transcription.machineGenerated') }}
        </p>
        <p class="text-sm text-muted">
          {{ t('routeVoiceReports.transcription.requestedLanguage') }}:
          {{ localeDisplay(report.requestedLocale ?? report.selectedLocale) }}
          <template v-if="report.detectedLocale">
            ·
            {{ t('routeVoiceReports.transcription.detectedLanguage') }}:
            {{ localeDisplay(report.detectedLocale) }}
          </template>
          <template v-if="confidenceLabel"> · {{ confidenceLabel }} </template>
        </p>
        <p
          class="whitespace-pre-wrap wrap-break-word text-sm"
          data-testid="route-voice-transcript-text"
        >
          {{ report.transcript ?? '' }}
        </p>
        <p v-if="report.transcriptionCompletedAt" class="text-xs text-muted">
          {{ formatDateTime(report.transcriptionCompletedAt) }}
        </p>
      </template>

      <template
        v-else-if="String(report.transcriptionStatus ?? '') === 'FAILED'"
      >
        <UAlert
          color="error"
          variant="subtle"
          role="status"
          data-testid="route-voice-transcription-failed"
          :title="t('routeVoiceReports.transcription.failed')"
          :description="failureExplanation"
        />
        <p class="text-sm text-muted">
          {{ t('routeVoiceReports.transcription.audioStillAvailable') }}
        </p>
        <UButton
          v-if="showRetry"
          size="sm"
          color="primary"
          variant="soft"
          class="min-h-11"
          data-testid="route-voice-retry-transcription"
          :loading="retrying"
          :disabled="retrying"
          :aria-label="
            t('routeVoiceReports.transcription.retryAria', {
              number: report.sequenceNumber,
            })
          "
          @click="emit('retry-transcription', report.id)"
        >
          {{
            retrying
              ? t('routeVoiceReports.transcription.retrying')
              : t('routeVoiceReports.transcription.retry')
          }}
        </UButton>
      </template>
    </section>
  </article>
</template>
