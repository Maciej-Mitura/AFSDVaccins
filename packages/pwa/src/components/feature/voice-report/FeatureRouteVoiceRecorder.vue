<script setup lang="ts">
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'

import FeatureRouteVoiceReportList from '@/components/feature/voice-report/FeatureRouteVoiceReportList.vue'
import type { RouteVoiceReportSelectedLocale } from '@/api/route-voice-report-rest'
import { useLanguage } from '@/composables/useLanguage'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { type RouteStatusValue } from '@/composables/useDeliveryRoutes'
import {
  filterLegacyRouteVoiceReports,
  filterReportsByStopId,
  useRouteVoiceReports,
} from '@/composables/voice-report/useRouteVoiceReports'
import { useVoiceRecorder } from '@/composables/voice-report/useVoiceRecorder'
import {
  acquireVoiceRecorderMutex,
  releaseVoiceRecorderMutex,
} from '@/composables/voice-report/voice-recorder-mutex'
import {
  defaultSelectedLocaleFromUi,
  formatDurationSeconds,
  formatFileSizeBytes,
} from '@/composables/voice-report/voice-recorder-types'
import type { RouteDataSource } from '@/offline/ui-error-category'

export type RouteVoiceRecorderMode = 'stop' | 'legacy' | 'route-all'

const props = withDefaults(
  defineProps<{
    routeId: string
    routeStatus: RouteStatusValue | string
    routeSource: RouteDataSource
    /** Show recorder creation controls (courier IN_PROGRESS only). */
    allowRecording: boolean
    /** Show courier display name on cards (admin). */
    showCourierName?: boolean
    /** ADMIN may retry failed transcription. */
    canRetryTranscription?: boolean
    /** Section title key override. */
    titleKey?: string
    /**
     * When false, hide entire feature (e.g. APOTHEKER).
     * Default must be true: Vue casts omitted Boolean props to false.
     */
    enabled?: boolean
    /** Stop scope for courier recording / filtering. */
    stopId?: string | null
    stopSequence?: number | null
    pharmacyName?: string | null
    /**
     * stop — courier stop-bound list + upload
     * legacy — read-only legacy reports
     * route-all — admin full list with stop grouping (default)
     */
    mode?: RouteVoiceRecorderMode
  }>(),
  {
    showCourierName: false,
    canRetryTranscription: false,
    enabled: true,
    stopId: null,
    stopSequence: null,
    pharmacyName: null,
    mode: 'route-all',
  },
)

const { t } = useI18n()
const { currentLocale } = useLanguage()
const { isOnline } = useOnlineStatus()

const routeIdRef = toRef(props, 'routeId')
const routeSourceRef = toRef(props, 'routeSource')
const enabledRef = computed(() => props.enabled !== false)
const canRetryRef = computed(() => props.canRetryTranscription === true)

const resolvedMode = computed<RouteVoiceRecorderMode>(() => {
  if (props.mode === 'legacy' || props.mode === 'route-all') {
    return props.mode
  }
  if (props.mode === 'stop' || props.stopId) {
    return 'stop'
  }
  return 'route-all'
})

const mutexKey = computed(() =>
  resolvedMode.value === 'legacy' ? 'legacy' : (props.stopId ?? 'route-all'),
)

const {
  reports,
  loading,
  errorMessage,
  uploading,
  uploadErrorMessage,
  retryingReportId,
  retryErrorMessage,
  lastUploadSuccess,
  uploadReport,
  retryTranscription,
  clearUploadFeedback,
} = useRouteVoiceReports({
  routeId: routeIdRef,
  routeSource: routeSourceRef,
  enabled: enabledRef,
  canRetryTranscription: canRetryRef,
})

const recorder = useVoiceRecorder()

const selectedLocale = ref<RouteVoiceReportSelectedLocale>(
  defaultSelectedLocaleFromUi(currentLocale.value),
)

watch(currentLocale, locale => {
  if (recorder.state.value === 'IDLE' || recorder.state.value === 'UPLOADED') {
    selectedLocale.value = defaultSelectedLocaleFromUi(locale)
  }
})

const localeOptions = computed(() => [
  { value: 'AUTO' as const, label: t('routeVoiceReports.language.automatic') },
  { value: 'en-GB' as const, label: t('routeVoiceReports.language.english') },
  { value: 'nl-NL' as const, label: t('routeVoiceReports.language.dutch') },
  { value: 'pl-PL' as const, label: t('routeVoiceReports.language.polish') },
])

const sectionTitle = computed(() => {
  if (props.titleKey) {
    return t(props.titleKey)
  }
  if (resolvedMode.value === 'legacy') {
    return t('routeVoiceReports.stop.legacyTitle')
  }
  if (resolvedMode.value === 'stop') {
    return t('routeVoiceReports.stop.title')
  }
  return t('routeVoiceReports.voiceReport')
})

const sectionDescription = computed(() => {
  if (resolvedMode.value === 'legacy') {
    return t('routeVoiceReports.stop.legacyDescription')
  }
  if (resolvedMode.value === 'stop') {
    return t('routeVoiceReports.description')
  }
  return t('routeVoiceReports.description')
})

const stopContextLabel = computed(() => {
  if (resolvedMode.value !== 'stop') {
    return null
  }
  const sequence = props.stopSequence
  const pharmacy = props.pharmacyName
  if (sequence != null && pharmacy) {
    return t('routeVoiceReports.stop.stopContext', {
      sequence,
      pharmacy,
    })
  }
  if (pharmacy) {
    return pharmacy
  }
  if (sequence != null) {
    return t('bezorger.route.stop.label', { sequence })
  }
  return null
})

const filteredReports = computed(() => {
  if (resolvedMode.value === 'stop' && props.stopId) {
    return filterReportsByStopId(reports.value, props.stopId)
  }
  if (resolvedMode.value === 'legacy') {
    return filterLegacyRouteVoiceReports(reports.value)
  }
  return reports.value
})

const emptyTitleKey = computed(() =>
  resolvedMode.value === 'stop'
    ? 'routeVoiceReports.stop.empty'
    : 'routeVoiceReports.empty.title',
)

const emptyDescriptionKey = computed(() =>
  resolvedMode.value === 'stop'
    ? 'routeVoiceReports.stop.previousReports'
    : 'routeVoiceReports.empty.description',
)

const showAssignedHint = computed(
  () =>
    props.allowRecording === false &&
    String(props.routeStatus) === 'ASSIGNED' &&
    props.routeSource === 'SERVER' &&
    resolvedMode.value !== 'legacy',
)

const recordingAllowedByMode = computed(() => {
  if (resolvedMode.value === 'legacy') {
    return false
  }
  if (resolvedMode.value === 'stop') {
    return Boolean(props.stopId)
  }
  // route-all: courier must not record without a stop — admin uses allowRecording=false
  return false
})

const canShowRecorderUi = computed(
  () => props.allowRecording && recordingAllowedByMode.value,
)

const canShowRecorder = computed(
  () =>
    canShowRecorderUi.value &&
    String(props.routeStatus) === 'IN_PROGRESS' &&
    props.routeSource === 'SERVER' &&
    isOnline.value &&
    recorder.isSupported.value,
)

const recordingDisabledReason = computed(() => {
  if (resolvedMode.value === 'stop' && !props.stopId) {
    return t('routeVoiceReports.error.stopIdRequired')
  }
  if (!isOnline.value) {
    return t('routeVoiceReports.recording.requiresInternet')
  }
  if (props.routeSource !== 'SERVER') {
    return t('routeVoiceReports.unavailableOffline')
  }
  if (!recorder.isSupported.value) {
    return t('routeVoiceReports.recording.unsupportedBrowser')
  }
  if (String(props.routeStatus) !== 'IN_PROGRESS') {
    return t('routeVoiceReports.stop.unavailableAfterCompletion')
  }
  return null
})

const liveStatusText = computed(() => {
  switch (recorder.state.value) {
    case 'REQUESTING_PERMISSION':
      return t('routeVoiceReports.recording.requestingPermission')
    case 'RECORDING':
      return t('routeVoiceReports.recording.recording')
    case 'PAUSED':
      return t('routeVoiceReports.recording.paused')
    case 'STOPPING':
      return t('routeVoiceReports.recording.recording')
    case 'UPLOADING':
      return t('routeVoiceReports.upload.uploading')
    case 'PREVIEW':
      return t('routeVoiceReports.preview.title')
    case 'ERROR':
      return recorder.error.value ? t(recorder.error.value.messageKey) : ''
    default:
      return ''
  }
})

const elapsedLabel = computed(() =>
  formatDurationSeconds(recorder.elapsedSeconds.value),
)

const remainingLabel = computed(() =>
  formatDurationSeconds(recorder.remainingSeconds.value),
)

function confirmLeaveUnsaved(): boolean {
  if (!recorder.hasUnsentRecording.value) {
    return true
  }
  return window.confirm(t('routeVoiceReports.recording.unsavedWillBeLost'))
}

function releaseMutexIfOwned(): void {
  releaseVoiceRecorderMutex(mutexKey.value)
}

async function onStart(): Promise<void> {
  if (!canShowRecorder.value || !props.stopId) {
    return
  }

  const acquired = acquireVoiceRecorderMutex({
    key: mutexKey.value,
    cancel: () => {
      recorder.cancelRecording()
      clearUploadFeedback()
    },
    hasUnsent: () => recorder.hasUnsentRecording.value,
    confirmLeave: confirmLeaveUnsaved,
  })
  if (!acquired) {
    return
  }

  clearUploadFeedback()
  const started = await recorder.startRecording()
  if (!started) {
    releaseMutexIfOwned()
  }
}

async function onStop(): Promise<void> {
  await recorder.stopRecording()
}

function onCancel(): void {
  recorder.cancelRecording()
  clearUploadFeedback()
  releaseMutexIfOwned()
}

function onDiscard(): void {
  recorder.discardPreview()
  clearUploadFeedback()
  selectedLocale.value = defaultSelectedLocaleFromUi(currentLocale.value)
  releaseMutexIfOwned()
}

async function onUpload(): Promise<void> {
  const blob = recorder.previewBlob.value
  const recordedAt = recorder.clientRecordedAt.value
  if (!blob || !recordedAt || !props.stopId) {
    return
  }

  if (!isOnline.value) {
    return
  }

  const uploadId = recorder.ensureClientUploadId()
  recorder.markUploading()

  const result = await uploadReport({
    audio: blob,
    stopId: props.stopId,
    clientRecordedAt: recordedAt,
    durationSeconds: recorder.durationSeconds.value,
    selectedLocale: selectedLocale.value,
    clientUploadId: uploadId,
  })

  if (result) {
    recorder.markUploaded()
    selectedLocale.value = defaultSelectedLocaleFromUi(currentLocale.value)
    releaseMutexIfOwned()
  } else {
    recorder.markUploadFailed()
  }
}

async function onRetryUpload(): Promise<void> {
  await onUpload()
}

async function onRetryTranscription(reportId: string): Promise<void> {
  await retryTranscription(reportId)
}

onBeforeRouteLeave(() => confirmLeaveUnsaved())

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (!recorder.hasUnsentRecording.value) {
    return
  }
  event.preventDefault()
  event.returnValue = ''
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', onBeforeUnload)
}

watch(
  () => props.routeStatus,
  status => {
    if (String(status) !== 'IN_PROGRESS') {
      if (
        recorder.state.value === 'RECORDING' ||
        recorder.state.value === 'PAUSED' ||
        recorder.state.value === 'REQUESTING_PERMISSION'
      ) {
        recorder.cancelRecording()
        releaseMutexIfOwned()
      }
    }
  },
)

watch(enabledRef, enabled => {
  if (!enabled) {
    recorder.reset()
    releaseMutexIfOwned()
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('beforeunload', onBeforeUnload)
  }
  if (recorder.hasUnsentRecording.value) {
    recorder.cancelRecording()
  }
  releaseMutexIfOwned()
})
</script>

<template>
  <section
    v-if="enabled"
    class="space-y-4"
    data-testid="route-voice-reports-section"
    :data-mode="resolvedMode"
    :data-stop-id="stopId ?? undefined"
    :aria-label="sectionTitle"
  >
    <div class="space-y-1">
      <h2 class="text-base font-semibold text-highlighted">
        {{ sectionTitle }}
      </h2>
      <p
        v-if="stopContextLabel"
        class="text-sm text-toned"
        data-testid="route-voice-stop-context"
      >
        {{ stopContextLabel }}
      </p>
      <p class="text-sm text-toned">
        {{ sectionDescription }}
      </p>
    </div>

    <UAlert
      v-if="routeSource !== 'SERVER'"
      color="warning"
      variant="subtle"
      role="status"
      data-testid="route-voice-reports-offline"
      :title="t('routeVoiceReports.unavailableOffline')"
    />

    <template v-else>
      <p
        v-if="showAssignedHint"
        class="text-sm text-muted"
        role="status"
        data-testid="route-voice-reports-assigned-hint"
      >
        {{ t('routeVoiceReports.availableWhenStarted') }}
      </p>

      <div
        v-if="canShowRecorderUi"
        class="space-y-3"
        data-testid="route-voice-recorder"
        role="region"
        :aria-label="sectionTitle"
      >
        <p class="text-sm text-muted" data-testid="route-voice-privacy-notice">
          {{ t('routeVoiceReports.privacy.notice') }}
        </p>

        <p
          class="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="route-voice-live-status"
        >
          {{ liveStatusText }}
        </p>

        <UAlert
          v-if="recorder.error.value"
          color="error"
          variant="subtle"
          role="alert"
          data-testid="route-voice-recorder-error"
          :title="t(recorder.error.value.messageKey)"
        />

        <UAlert
          v-if="
            recorder.maxDurationReached.value &&
            recorder.state.value === 'PREVIEW'
          "
          color="warning"
          variant="subtle"
          role="status"
          data-testid="route-voice-max-duration"
          :title="t('routeVoiceReports.recording.maxDurationReached')"
        />

        <UAlert
          v-if="uploadErrorMessage"
          color="error"
          variant="subtle"
          role="alert"
          data-testid="route-voice-upload-error"
          :title="uploadErrorMessage"
        />

        <UAlert
          v-if="lastUploadSuccess && !uploadErrorMessage"
          color="success"
          variant="subtle"
          role="status"
          data-testid="route-voice-upload-success"
          :title="t('routeVoiceReports.upload.success')"
        />

        <UAlert
          v-if="
            !canShowRecorder &&
            recordingDisabledReason &&
            recorder.state.value === 'IDLE'
          "
          color="warning"
          variant="subtle"
          role="status"
          data-testid="route-voice-recording-disabled"
          :title="recordingDisabledReason"
        />

        <!-- Idle -->
        <div
          v-if="
            recorder.state.value === 'IDLE' ||
            recorder.state.value === 'ERROR' ||
            recorder.state.value === 'UPLOADED'
          "
          class="flex flex-col gap-2"
        >
          <UButton
            block
            size="xl"
            class="min-h-14 text-base"
            color="primary"
            variant="soft"
            data-testid="route-voice-start"
            :disabled="!canShowRecorder"
            :title="recordingDisabledReason ?? undefined"
            :aria-disabled="!canShowRecorder"
            :aria-label="t('routeVoiceReports.stop.record')"
            @click="onStart"
          >
            {{ t('routeVoiceReports.stop.record') }}
          </UButton>
        </div>

        <!-- Requesting -->
        <p
          v-else-if="recorder.state.value === 'REQUESTING_PERMISSION'"
          class="text-sm"
          role="status"
          data-testid="route-voice-requesting"
        >
          {{ t('routeVoiceReports.recording.requestingPermission') }}
        </p>

        <!-- Recording / Paused -->
        <div
          v-else-if="
            recorder.state.value === 'RECORDING' ||
            recorder.state.value === 'PAUSED' ||
            recorder.state.value === 'STOPPING'
          "
          class="space-y-3 rounded-md bg-muted px-4 py-3"
        >
          <div class="flex items-center gap-2">
            <span
              class="inline-flex h-3 w-3 shrink-0 rounded-full bg-error"
              :class="
                recorder.state.value === 'RECORDING'
                  ? 'motion-safe:animate-pulse'
                  : ''
              "
              aria-hidden="true"
              data-testid="route-voice-recording-indicator"
            />
            <p
              class="font-medium"
              role="status"
              aria-live="polite"
              data-testid="route-voice-recording-label"
            >
              {{
                recorder.state.value === 'PAUSED'
                  ? t('routeVoiceReports.recording.paused')
                  : t('routeVoiceReports.recording.recording')
              }}
            </p>
          </div>

          <p
            class="font-mono text-lg tabular-nums"
            data-testid="route-voice-elapsed"
            :aria-label="
              t('routeVoiceReports.preview.duration') + ': ' + elapsedLabel
            "
          >
            {{ elapsedLabel }}
            <span class="text-sm text-muted"> / {{ remainingLabel }} </span>
          </p>

          <p
            v-if="recorder.nearLimit.value"
            class="text-sm text-warning"
            role="status"
          >
            {{ remainingLabel }}
          </p>

          <div class="flex flex-col gap-2 sm:flex-row">
            <UButton
              v-if="
                recorder.supportsPauseResume.value &&
                recorder.state.value === 'RECORDING'
              "
              size="lg"
              class="min-h-12"
              color="neutral"
              variant="soft"
              data-testid="route-voice-pause"
              @click="recorder.pauseRecording()"
            >
              {{ t('routeVoiceReports.recording.pause') }}
            </UButton>
            <UButton
              v-if="
                recorder.supportsPauseResume.value &&
                recorder.state.value === 'PAUSED'
              "
              size="lg"
              class="min-h-12"
              color="primary"
              data-testid="route-voice-resume"
              @click="recorder.resumeRecording()"
            >
              {{ t('routeVoiceReports.recording.resume') }}
            </UButton>
            <UButton
              size="lg"
              class="min-h-12"
              color="primary"
              data-testid="route-voice-stop"
              :disabled="recorder.state.value === 'STOPPING'"
              :aria-label="t('routeVoiceReports.recording.stop')"
              @click="onStop"
            >
              {{ t('routeVoiceReports.recording.stop') }}
            </UButton>
            <UButton
              size="lg"
              class="min-h-12"
              color="neutral"
              variant="ghost"
              data-testid="route-voice-cancel"
              :disabled="recorder.state.value === 'STOPPING'"
              :aria-label="t('routeVoiceReports.recording.cancel')"
              @click="onCancel"
            >
              {{ t('routeVoiceReports.recording.cancel') }}
            </UButton>
          </div>
        </div>

        <!-- Preview / Uploading -->
        <div
          v-else-if="
            recorder.state.value === 'PREVIEW' ||
            recorder.state.value === 'UPLOADING'
          "
          class="space-y-3 rounded-md bg-muted px-4 py-3"
          data-testid="route-voice-preview"
        >
          <p class="font-medium">{{ t('routeVoiceReports.preview.title') }}</p>

          <audio
            v-if="recorder.previewUrl.value"
            controls
            preload="metadata"
            class="w-full max-w-full"
            :src="recorder.previewUrl.value"
            :aria-label="t('routeVoiceReports.playback.play')"
            data-testid="route-voice-preview-audio"
          />

          <p class="text-sm text-muted">
            {{ t('routeVoiceReports.preview.duration') }}:
            {{ formatDurationSeconds(recorder.durationSeconds.value) }}
            ·
            {{ t('routeVoiceReports.preview.fileSize') }}:
            {{ formatFileSizeBytes(recorder.previewSizeBytes.value) }}
          </p>

          <UFormField
            :label="t('routeVoiceReports.preview.language')"
            name="selectedLocale"
          >
            <USelect
              v-model="selectedLocale"
              :items="localeOptions"
              class="w-full"
              :disabled="recorder.state.value === 'UPLOADING' || uploading"
              data-testid="route-voice-locale"
            />
          </UFormField>

          <p
            v-if="!isOnline"
            class="text-sm text-warning"
            role="status"
            data-testid="route-voice-offline-upload-blocked"
          >
            {{ t('routeVoiceReports.recording.requiresInternet') }}
            {{ t('routeVoiceReports.recording.unsavedWillBeLost') }}
          </p>

          <div class="flex flex-col gap-2 sm:flex-row">
            <UButton
              size="lg"
              class="min-h-12"
              color="primary"
              data-testid="route-voice-upload"
              :loading="recorder.state.value === 'UPLOADING' || uploading"
              :disabled="
                !isOnline || recorder.state.value === 'UPLOADING' || uploading
              "
              :aria-label="
                uploadErrorMessage
                  ? t('routeVoiceReports.upload.retry')
                  : t('routeVoiceReports.upload.upload')
              "
              @click="uploadErrorMessage ? onRetryUpload() : onUpload()"
            >
              {{
                uploadErrorMessage
                  ? t('routeVoiceReports.upload.retry')
                  : recorder.state.value === 'UPLOADING' || uploading
                    ? t('routeVoiceReports.upload.uploading')
                    : t('routeVoiceReports.upload.upload')
              }}
            </UButton>
            <UButton
              size="lg"
              class="min-h-12"
              color="neutral"
              variant="ghost"
              data-testid="route-voice-discard"
              :disabled="recorder.state.value === 'UPLOADING' || uploading"
              :aria-label="t('routeVoiceReports.upload.discard')"
              @click="onDiscard"
            >
              {{ t('routeVoiceReports.upload.discard') }}
            </UButton>
          </div>
        </div>
      </div>

      <FeatureRouteVoiceReportList
        :reports="filteredReports"
        :loading="loading"
        :error-message="errorMessage"
        :route-id="routeId"
        :show-courier-name="showCourierName === true"
        :show-stop-context="resolvedMode === 'route-all'"
        :group-by-stop="resolvedMode === 'route-all'"
        :empty-title-key="emptyTitleKey"
        :empty-description-key="emptyDescriptionKey"
        :can-retry-transcription="canRetryTranscription === true"
        :retrying-report-id="retryingReportId"
        :retry-error-message="retryErrorMessage"
        @retry-transcription="onRetryTranscription"
      />
    </template>
  </section>
</template>
