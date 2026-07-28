/**
 * Phase 34C voice recorder state machine and MIME negotiation helpers.
 */

import { translate } from '@/i18n'

export const VOICE_RECORDER_STATES = [
  'IDLE',
  'REQUESTING_PERMISSION',
  'RECORDING',
  'PAUSED',
  'STOPPING',
  'PREVIEW',
  'UPLOADING',
  'UPLOADED',
  'ERROR',
] as const

export type VoiceRecorderState = (typeof VOICE_RECORDER_STATES)[number]

export type VoiceRecorderErrorKind =
  | 'unsupported'
  | 'insecure-context'
  | 'permission-denied'
  | 'no-microphone'
  | 'device-busy'
  | 'recorder-init-failed'
  | 'microphone-lost'
  | 'too-short'
  | 'too-large'
  | 'unknown'

export type VoiceRecorderError = {
  kind: VoiceRecorderErrorKind
  messageKey: string
}

/** Preferred MediaRecorder MIME types (Safari must not be forced to WebM). */
export const PREFERRED_RECORDER_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/webm',
] as const

export function isMediaRecorderSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  )
}

export function isSecureRecordingContext(): boolean {
  return typeof window === 'undefined' || window.isSecureContext !== false
}

/**
 * Select the first supported MediaRecorder MIME type, or null for browser default.
 */
export function selectRecorderMimeType(
  isTypeSupported: (type: string) => boolean = type => {
    try {
      return (
        typeof MediaRecorder !== 'undefined' &&
        typeof MediaRecorder.isTypeSupported === 'function' &&
        MediaRecorder.isTypeSupported(type)
      )
    } catch {
      return false
    }
  },
): string | null {
  for (const candidate of PREFERRED_RECORDER_MIME_TYPES) {
    if (isTypeSupported(candidate)) {
      return candidate
    }
  }
  return null
}

export function classifyMicrophoneError(
  error: unknown,
): VoiceRecorderErrorKind {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    // Prefer concrete DOMException when present.
  }

  const name =
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof Reflect.get(error, 'name') === 'string'
      ? String(Reflect.get(error, 'name'))
      : ''

  if (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    name === 'SecurityError'
  ) {
    return 'permission-denied'
  }

  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    name === 'OverconstrainedError'
  ) {
    return 'no-microphone'
  }

  if (
    name === 'NotReadableError' ||
    name === 'TrackStartError' ||
    name === 'AbortError'
  ) {
    return 'device-busy'
  }

  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return 'insecure-context'
  }

  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  ) {
    return 'unsupported'
  }

  return 'unknown'
}

export function errorKindToMessageKey(kind: VoiceRecorderErrorKind): string {
  switch (kind) {
    case 'unsupported':
      return 'routeVoiceReports.recording.unsupportedBrowser'
    case 'insecure-context':
      return 'routeVoiceReports.recording.microphoneUnavailable'
    case 'permission-denied':
      return 'routeVoiceReports.recording.permissionDenied'
    case 'no-microphone':
      return 'routeVoiceReports.recording.microphoneUnavailable'
    case 'device-busy':
      return 'routeVoiceReports.recording.microphoneUnavailable'
    case 'recorder-init-failed':
      return 'routeVoiceReports.recording.microphoneUnavailable'
    case 'microphone-lost':
      return 'routeVoiceReports.recording.microphoneUnavailable'
    case 'too-short':
      return 'routeVoiceReports.recording.tooShort'
    case 'too-large':
      return 'routeVoiceReports.error.audioTooLarge'
    default:
      return 'routeVoiceReports.recording.microphoneUnavailable'
  }
}

export function stopMediaStreamTracks(
  stream: MediaStream | null | undefined,
): void {
  if (!stream) {
    return
  }
  for (const track of stream.getTracks()) {
    try {
      track.stop()
    } catch {
      // Ignore already-stopped tracks.
    }
  }
}

export function generateClientUploadId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }
  return `vr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function formatDurationSeconds(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(clamped / 60)
  const seconds = clamped % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatFileSizeBytes(bytes: number): string {
  const unitBytes = translate('routeVoiceReports.preview.unit.bytes')
  const unitKib = translate('routeVoiceReports.preview.unit.kib')
  const unitMib = translate('routeVoiceReports.preview.unit.mib')

  if (bytes < 1024) {
    return translate('routeVoiceReports.preview.fileSizeValue', {
      size: String(bytes),
      unit: unitBytes,
    })
  }
  if (bytes < 1024 * 1024) {
    return translate('routeVoiceReports.preview.fileSizeValue', {
      size: (bytes / 1024).toFixed(1),
      unit: unitKib,
    })
  }
  return translate('routeVoiceReports.preview.fileSizeValue', {
    size: (bytes / (1024 * 1024)).toFixed(2),
    unit: unitMib,
  })
}

export function defaultSelectedLocaleFromUi(
  uiLocale: string,
): 'AUTO' | 'en-GB' | 'nl-NL' | 'pl-PL' {
  const normalised = uiLocale.trim().toLowerCase()
  if (normalised === 'en' || normalised.startsWith('en-')) {
    return 'en-GB'
  }
  if (normalised === 'nl' || normalised.startsWith('nl-')) {
    return 'nl-NL'
  }
  if (normalised === 'pl' || normalised.startsWith('pl-')) {
    return 'pl-PL'
  }
  return 'AUTO'
}
