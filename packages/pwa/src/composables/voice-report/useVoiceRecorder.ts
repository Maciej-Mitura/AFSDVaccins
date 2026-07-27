import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  readonly,
  ref,
  type ComputedRef,
  type Ref,
} from 'vue'

import {
  ROUTE_VOICE_REPORT_MAX_AUDIO_BYTES,
  ROUTE_VOICE_REPORT_MAX_DURATION_SECONDS,
  ROUTE_VOICE_REPORT_MIN_DURATION_SECONDS,
  ROUTE_VOICE_REPORT_WARN_DURATION_SECONDS,
} from '@/api/route-voice-report-rest'
import {
  classifyMicrophoneError,
  errorKindToMessageKey,
  generateClientUploadId,
  isMediaRecorderSupported,
  isSecureRecordingContext,
  selectRecorderMimeType,
  stopMediaStreamTracks,
  type VoiceRecorderError,
  type VoiceRecorderState,
} from '@/composables/voice-report/voice-recorder-types'

export type UseVoiceRecorderResult = {
  state: Readonly<Ref<VoiceRecorderState>>
  isSupported: ComputedRef<boolean>
  supportsPauseResume: ComputedRef<boolean>
  elapsedSeconds: Readonly<Ref<number>>
  remainingSeconds: ComputedRef<number>
  nearLimit: ComputedRef<boolean>
  maxDurationReached: Readonly<Ref<boolean>>
  previewUrl: Readonly<Ref<string | null>>
  previewBlob: Readonly<Ref<Blob | null>>
  previewMimeType: Readonly<Ref<string | null>>
  previewSizeBytes: ComputedRef<number>
  clientRecordedAt: Readonly<Ref<string | null>>
  clientUploadId: Readonly<Ref<string | null>>
  durationSeconds: Readonly<Ref<number>>
  error: Readonly<Ref<VoiceRecorderError | null>>
  hasUnsentRecording: ComputedRef<boolean>
  startRecording: () => Promise<boolean>
  pauseRecording: () => void
  resumeRecording: () => void
  stopRecording: () => Promise<boolean>
  cancelRecording: () => void
  discardPreview: () => void
  markUploading: () => void
  markUploaded: () => void
  markUploadFailed: () => void
  reset: () => void
  ensureClientUploadId: () => string
}

/**
 * Browser MediaRecorder abstraction for route voice reports.
 * One active recorder instance per composable call; tracks always stopped on exit.
 */
export function useVoiceRecorder(): UseVoiceRecorderResult {
  const state = ref<VoiceRecorderState>('IDLE')
  const elapsedSeconds = ref(0)
  const maxDurationReached = ref(false)
  const previewUrl = ref<string | null>(null)
  const previewBlob = ref<Blob | null>(null)
  const previewMimeType = ref<string | null>(null)
  const clientRecordedAt = ref<string | null>(null)
  const clientUploadId = ref<string | null>(null)
  const durationSeconds = ref(0)
  const error = ref<VoiceRecorderError | null>(null)

  let mediaStream: MediaStream | null = null
  let mediaRecorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let selectedMimeType: string | null = null
  let tickTimer: ReturnType<typeof setInterval> | null = null
  let activeMs = 0
  let segmentStartedAt: number | null = null
  let pauseResumeSupported = false

  const isSupported = computed(
    () => isMediaRecorderSupported() && isSecureRecordingContext(),
  )

  const supportsPauseResume = computed(() => pauseResumeSupported)

  const remainingSeconds = computed(() =>
    Math.max(0, ROUTE_VOICE_REPORT_MAX_DURATION_SECONDS - elapsedSeconds.value),
  )

  const nearLimit = computed(
    () =>
      elapsedSeconds.value >= ROUTE_VOICE_REPORT_WARN_DURATION_SECONDS &&
      state.value === 'RECORDING',
  )

  const previewSizeBytes = computed(() => previewBlob.value?.size ?? 0)

  const hasUnsentRecording = computed(() => {
    const s = state.value
    return (
      s === 'RECORDING' ||
      s === 'PAUSED' ||
      s === 'PREVIEW' ||
      s === 'STOPPING' ||
      s === 'UPLOADING'
    )
  })

  function setError(kind: VoiceRecorderError['kind']): void {
    error.value = {
      kind,
      messageKey: errorKindToMessageKey(kind),
    }
    state.value = 'ERROR'
  }

  function clearTick(): void {
    if (tickTimer) {
      clearInterval(tickTimer)
      tickTimer = null
    }
  }

  function flushActiveSegment(): void {
    if (segmentStartedAt !== null) {
      activeMs += Date.now() - segmentStartedAt
      segmentStartedAt = null
    }
  }

  function syncElapsed(): void {
    let total = activeMs
    if (segmentStartedAt !== null) {
      total += Date.now() - segmentStartedAt
    }
    elapsedSeconds.value = Math.floor(total / 1000)

    if (
      elapsedSeconds.value >= ROUTE_VOICE_REPORT_MAX_DURATION_SECONDS &&
      (state.value === 'RECORDING' || state.value === 'PAUSED')
    ) {
      maxDurationReached.value = true
      void stopRecording()
    }
  }

  function startTick(): void {
    clearTick()
    tickTimer = setInterval(() => {
      syncElapsed()
    }, 250)
  }

  function revokePreviewUrl(): void {
    if (previewUrl.value) {
      try {
        URL.revokeObjectURL(previewUrl.value)
      } catch {
        // Ignore revoke failures.
      }
      previewUrl.value = null
    }
  }

  function releaseStreamAndRecorder(): void {
    clearTick()
    flushActiveSegment()

    if (mediaRecorder) {
      try {
        if (mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop()
        }
      } catch {
        // Ignore stop races.
      }
      mediaRecorder.ondataavailable = null
      mediaRecorder.onerror = null
      mediaRecorder.onstop = null
      mediaRecorder = null
    }

    stopMediaStreamTracks(mediaStream)
    mediaStream = null
    chunks = []
  }

  function clearPreviewArtifacts(): void {
    revokePreviewUrl()
    previewBlob.value = null
    previewMimeType.value = null
  }

  function resetInternal(keepError = false): void {
    releaseStreamAndRecorder()
    clearPreviewArtifacts()
    elapsedSeconds.value = 0
    activeMs = 0
    segmentStartedAt = null
    maxDurationReached.value = false
    clientRecordedAt.value = null
    clientUploadId.value = null
    durationSeconds.value = 0
    pauseResumeSupported = false
    selectedMimeType = null
    if (!keepError) {
      error.value = null
    }
    state.value = keepError ? 'ERROR' : 'IDLE'
  }

  function ensureClientUploadId(): string {
    if (!clientUploadId.value) {
      clientUploadId.value = generateClientUploadId()
    }
    return clientUploadId.value
  }

  async function startRecording(): Promise<boolean> {
    if (
      state.value !== 'IDLE' &&
      state.value !== 'ERROR' &&
      state.value !== 'UPLOADED'
    ) {
      return false
    }

    if (!isMediaRecorderSupported()) {
      setError('unsupported')
      return false
    }

    if (!isSecureRecordingContext()) {
      setError('insecure-context')
      return false
    }

    resetInternal()
    state.value = 'REQUESTING_PERMISSION'
    error.value = null

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err: unknown) {
      releaseStreamAndRecorder()
      setError(classifyMicrophoneError(err))
      return false
    }

    selectedMimeType = selectRecorderMimeType()

    try {
      mediaRecorder = selectedMimeType
        ? new MediaRecorder(mediaStream, { mimeType: selectedMimeType })
        : new MediaRecorder(mediaStream)
    } catch {
      releaseStreamAndRecorder()
      setError('recorder-init-failed')
      return false
    }

    pauseResumeSupported =
      typeof mediaRecorder.pause === 'function' &&
      typeof mediaRecorder.resume === 'function'

    chunks = []
    mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data)
      }
    }

    mediaRecorder.onerror = () => {
      releaseStreamAndRecorder()
      setError('recorder-init-failed')
    }

    for (const track of mediaStream.getTracks()) {
      track.onended = () => {
        if (state.value === 'RECORDING' || state.value === 'PAUSED') {
          releaseStreamAndRecorder()
          setError('microphone-lost')
        }
      }
    }

    clientRecordedAt.value = new Date().toISOString()
    clientUploadId.value = generateClientUploadId()
    activeMs = 0
    segmentStartedAt = Date.now()
    maxDurationReached.value = false
    elapsedSeconds.value = 0

    try {
      mediaRecorder.start(250)
    } catch {
      releaseStreamAndRecorder()
      setError('recorder-init-failed')
      return false
    }

    state.value = 'RECORDING'
    startTick()
    return true
  }

  function pauseRecording(): void {
    if (
      state.value !== 'RECORDING' ||
      !mediaRecorder ||
      !pauseResumeSupported
    ) {
      return
    }
    if (typeof mediaRecorder.pause !== 'function') {
      return
    }
    try {
      mediaRecorder.pause()
    } catch {
      return
    }
    flushActiveSegment()
    clearTick()
    state.value = 'PAUSED'
  }

  function resumeRecording(): void {
    if (state.value !== 'PAUSED' || !mediaRecorder || !pauseResumeSupported) {
      return
    }
    if (typeof mediaRecorder.resume !== 'function') {
      return
    }
    try {
      mediaRecorder.resume()
    } catch {
      return
    }
    segmentStartedAt = Date.now()
    state.value = 'RECORDING'
    startTick()
  }

  function buildPreviewFromChunks(): boolean {
    const mime =
      mediaRecorder?.mimeType ||
      selectedMimeType ||
      chunks[0]?.type ||
      'audio/webm'
    const blob = new Blob(chunks, { type: mime })

    if (blob.size > ROUTE_VOICE_REPORT_MAX_AUDIO_BYTES) {
      clearPreviewArtifacts()
      setError('too-large')
      return false
    }

    const duration = Math.max(0, Math.round((activeMs / 1000) * 10) / 10)

    if (duration < ROUTE_VOICE_REPORT_MIN_DURATION_SECONDS) {
      clearPreviewArtifacts()
      setError('too-short')
      return false
    }

    durationSeconds.value = duration
    previewBlob.value = blob
    previewMimeType.value = mime
    revokePreviewUrl()
    previewUrl.value = URL.createObjectURL(blob)
    state.value = 'PREVIEW'
    return true
  }

  function stopRecording(): Promise<boolean> {
    return new Promise(resolve => {
      if (state.value !== 'RECORDING' && state.value !== 'PAUSED') {
        resolve(false)
        return
      }

      if (!mediaRecorder) {
        releaseStreamAndRecorder()
        setError('recorder-init-failed')
        resolve(false)
        return
      }

      state.value = 'STOPPING'
      clearTick()
      flushActiveSegment()

      const recorder = mediaRecorder

      recorder.onstop = () => {
        stopMediaStreamTracks(mediaStream)
        mediaStream = null
        mediaRecorder = null
        const ok = buildPreviewFromChunks()
        chunks = []
        resolve(ok)
      }

      try {
        if (recorder.state !== 'inactive') {
          recorder.stop()
        } else {
          recorder.onstop?.(new Event('stop'))
        }
      } catch {
        releaseStreamAndRecorder()
        setError('recorder-init-failed')
        resolve(false)
      }
    })
  }

  function cancelRecording(): void {
    releaseStreamAndRecorder()
    clearPreviewArtifacts()
    elapsedSeconds.value = 0
    activeMs = 0
    segmentStartedAt = null
    maxDurationReached.value = false
    clientRecordedAt.value = null
    clientUploadId.value = null
    durationSeconds.value = 0
    error.value = null
    state.value = 'IDLE'
  }

  function discardPreview(): void {
    if (state.value !== 'PREVIEW' && state.value !== 'ERROR') {
      return
    }
    cancelRecording()
  }

  function markUploading(): void {
    if (state.value === 'PREVIEW') {
      // Stream already stopped in PREVIEW; ensure no lingering tracks.
      releaseStreamAndRecorder()
      state.value = 'UPLOADING'
    }
  }

  function markUploaded(): void {
    clearPreviewArtifacts()
    clientRecordedAt.value = null
    clientUploadId.value = null
    durationSeconds.value = 0
    elapsedSeconds.value = 0
    activeMs = 0
    maxDurationReached.value = false
    error.value = null
    state.value = 'UPLOADED'
    // Transition to IDLE so a new recording can start.
    state.value = 'IDLE'
  }

  function markUploadFailed(): void {
    if (state.value === 'UPLOADING') {
      state.value = 'PREVIEW'
    }
  }

  function reset(): void {
    resetInternal(false)
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      releaseStreamAndRecorder()
      revokePreviewUrl()
    })
  }

  return {
    state: readonly(state),
    isSupported,
    supportsPauseResume,
    elapsedSeconds: readonly(elapsedSeconds),
    remainingSeconds,
    nearLimit,
    maxDurationReached: readonly(maxDurationReached),
    previewUrl: readonly(previewUrl),
    previewBlob: readonly(previewBlob),
    previewMimeType: readonly(previewMimeType),
    previewSizeBytes,
    clientRecordedAt: readonly(clientRecordedAt),
    clientUploadId: readonly(clientUploadId),
    durationSeconds: readonly(durationSeconds),
    error: readonly(error),
    hasUnsentRecording,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
    discardPreview,
    markUploading,
    markUploaded,
    markUploadFailed,
    reset,
    ensureClientUploadId,
  }
}
