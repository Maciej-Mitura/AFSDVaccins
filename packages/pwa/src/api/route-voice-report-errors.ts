import { translate } from '@/i18n/translate'

/** Stable REST / domain error codes for route voice reports (Phase 34C). */
export type RouteVoiceReportRestErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NETWORK_ERROR'
  | 'INVALID_AUDIO_RESPONSE'
  | 'ROUTE_VOICE_REPORT_ROUTE_NOT_FOUND'
  | 'ROUTE_VOICE_REPORT_FORBIDDEN'
  | 'ROUTE_VOICE_REPORT_ROUTE_NOT_IN_PROGRESS'
  | 'ROUTE_VOICE_REPORT_STOP_ID_REQUIRED'
  | 'ROUTE_VOICE_REPORT_STOP_NOT_FOUND'
  | 'ROUTE_VOICE_REPORT_STOP_INVALID'
  | 'ROUTE_VOICE_REPORT_LIMIT_REACHED'
  | 'ROUTE_VOICE_REPORT_AUDIO_REQUIRED'
  | 'ROUTE_VOICE_REPORT_AUDIO_EMPTY'
  | 'ROUTE_VOICE_REPORT_AUDIO_TOO_LARGE'
  | 'ROUTE_VOICE_REPORT_AUDIO_TYPE_UNSUPPORTED'
  | 'ROUTE_VOICE_REPORT_AUDIO_SIGNATURE_INVALID'
  | 'ROUTE_VOICE_REPORT_DURATION_INVALID'
  | 'ROUTE_VOICE_REPORT_TIMESTAMP_INVALID'
  | 'ROUTE_VOICE_REPORT_IDEMPOTENCY_CONFLICT'
  | 'ROUTE_VOICE_REPORT_NOT_FOUND'
  | 'ROUTE_VOICE_REPORT_NOT_AVAILABLE'
  | 'ROUTE_VOICE_REPORT_STORAGE_FAILED'
  | 'ROUTE_VOICE_REPORT_CREATION_FAILED'
  | 'ROUTE_VOICE_REPORT_STREAM_FAILED'
  | 'ROUTE_VOICE_REPORT_LOCALE_INVALID'
  | 'ROUTE_VOICE_REPORT_CLIENT_UPLOAD_ID_INVALID'
  | 'ROUTE_VOICE_TRANSCRIPTION_FORBIDDEN'
  | 'ROUTE_VOICE_TRANSCRIPTION_NOT_FOUND'
  | 'ROUTE_VOICE_TRANSCRIPTION_ALREADY_COMPLETED'
  | 'ROUTE_VOICE_TRANSCRIPTION_ALREADY_PROCESSING'
  | 'ROUTE_VOICE_TRANSCRIPTION_RETRY_NOT_ALLOWED'
  | 'ROUTE_VOICE_TRANSCRIPTION_NO_SPEECH'
  | 'ROUTE_VOICE_TRANSCRIPTION_PROVIDER_TIMEOUT'
  | 'ROUTE_VOICE_TRANSCRIPTION_PROVIDER_THROTTLED'
  | 'ROUTE_VOICE_TRANSCRIPTION_PROVIDER_UNAVAILABLE'
  | 'ROUTE_VOICE_TRANSCRIPTION_NOT_CONFIGURED'
  | 'ROUTE_VOICE_TRANSCRIPTION_AUDIO_UNSUPPORTED'
  | 'ROUTE_VOICE_TRANSCRIPTION_AUDIO_MISSING'
  | 'ROUTE_VOICE_TRANSCRIPTION_FAILED'
  | 'UNKNOWN'

export class RouteVoiceReportRestError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message?: string) {
    super(message ?? code)
    this.name = 'RouteVoiceReportRestError'
    this.status = status
    this.code = code
  }
}

const STATUS_CODE_FALLBACKS: Record<number, RouteVoiceReportRestErrorCode> = {
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  413: 'ROUTE_VOICE_REPORT_AUDIO_TOO_LARGE',
  415: 'ROUTE_VOICE_REPORT_AUDIO_TYPE_UNSUPPORTED',
}

const ERROR_CODE_KEYS: Record<string, string> = {
  UNAUTHENTICATED: 'routeVoiceReports.error.forbidden',
  FORBIDDEN: 'routeVoiceReports.error.forbidden',
  NETWORK_ERROR: 'routeVoiceReports.error.uploadFailed',
  INVALID_AUDIO_RESPONSE: 'routeVoiceReports.error.playbackUnavailable',
  ROUTE_VOICE_REPORT_ROUTE_NOT_FOUND: 'routeVoiceReports.error.forbidden',
  ROUTE_VOICE_REPORT_FORBIDDEN: 'routeVoiceReports.error.forbidden',
  ROUTE_VOICE_REPORT_ROUTE_NOT_IN_PROGRESS:
    'routeVoiceReports.error.routeNotActive',
  ROUTE_VOICE_REPORT_STOP_ID_REQUIRED: 'routeVoiceReports.error.stopIdRequired',
  ROUTE_VOICE_REPORT_STOP_NOT_FOUND: 'routeVoiceReports.error.stopNotFound',
  ROUTE_VOICE_REPORT_STOP_INVALID: 'routeVoiceReports.error.stopInvalid',
  ROUTE_VOICE_REPORT_LIMIT_REACHED: 'routeVoiceReports.error.limitReached',
  ROUTE_VOICE_REPORT_AUDIO_REQUIRED: 'routeVoiceReports.error.invalidAudio',
  ROUTE_VOICE_REPORT_AUDIO_EMPTY: 'routeVoiceReports.error.invalidAudio',
  ROUTE_VOICE_REPORT_AUDIO_TOO_LARGE: 'routeVoiceReports.error.audioTooLarge',
  ROUTE_VOICE_REPORT_AUDIO_TYPE_UNSUPPORTED:
    'routeVoiceReports.error.unsupportedFormat',
  ROUTE_VOICE_REPORT_AUDIO_SIGNATURE_INVALID:
    'routeVoiceReports.error.invalidAudio',
  ROUTE_VOICE_REPORT_DURATION_INVALID:
    'routeVoiceReports.error.recordingTooShort',
  ROUTE_VOICE_REPORT_TIMESTAMP_INVALID: 'routeVoiceReports.error.uploadFailed',
  ROUTE_VOICE_REPORT_IDEMPOTENCY_CONFLICT:
    'routeVoiceReports.error.uploadFailed',
  ROUTE_VOICE_REPORT_NOT_FOUND: 'routeVoiceReports.error.playbackUnavailable',
  ROUTE_VOICE_REPORT_NOT_AVAILABLE:
    'routeVoiceReports.error.playbackUnavailable',
  ROUTE_VOICE_REPORT_STORAGE_FAILED: 'routeVoiceReports.error.storageFailed',
  ROUTE_VOICE_REPORT_CREATION_FAILED: 'routeVoiceReports.error.uploadFailed',
  ROUTE_VOICE_REPORT_STREAM_FAILED:
    'routeVoiceReports.error.playbackUnavailable',
  ROUTE_VOICE_REPORT_LOCALE_INVALID: 'routeVoiceReports.error.uploadFailed',
  ROUTE_VOICE_REPORT_CLIENT_UPLOAD_ID_INVALID:
    'routeVoiceReports.error.uploadFailed',
  ROUTE_VOICE_TRANSCRIPTION_FORBIDDEN:
    'routeVoiceReports.error.retryNotAllowed',
  ROUTE_VOICE_TRANSCRIPTION_NOT_FOUND:
    'routeVoiceReports.error.retryNotAllowed',
  ROUTE_VOICE_TRANSCRIPTION_ALREADY_COMPLETED:
    'routeVoiceReports.error.retryNotAllowed',
  ROUTE_VOICE_TRANSCRIPTION_ALREADY_PROCESSING:
    'routeVoiceReports.error.retryNotAllowed',
  ROUTE_VOICE_TRANSCRIPTION_RETRY_NOT_ALLOWED:
    'routeVoiceReports.error.retryNotAllowed',
  ROUTE_VOICE_TRANSCRIPTION_NO_SPEECH:
    'routeVoiceReports.transcription.noSpeech',
  ROUTE_VOICE_TRANSCRIPTION_PROVIDER_TIMEOUT:
    'routeVoiceReports.transcription.providerTimeout',
  ROUTE_VOICE_TRANSCRIPTION_PROVIDER_THROTTLED:
    'routeVoiceReports.transcription.providerThrottled',
  ROUTE_VOICE_TRANSCRIPTION_PROVIDER_UNAVAILABLE:
    'routeVoiceReports.transcription.unavailable',
  ROUTE_VOICE_TRANSCRIPTION_NOT_CONFIGURED:
    'routeVoiceReports.transcription.unavailable',
  ROUTE_VOICE_TRANSCRIPTION_AUDIO_UNSUPPORTED:
    'routeVoiceReports.error.unsupportedFormat',
  ROUTE_VOICE_TRANSCRIPTION_AUDIO_MISSING:
    'routeVoiceReports.error.playbackUnavailable',
  ROUTE_VOICE_TRANSCRIPTION_FAILED: 'routeVoiceReports.transcription.failed',
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function readErrorCode(body: unknown): string | null {
  const record = asRecord(body)
  if (!record) {
    return null
  }

  if (typeof record.error === 'string' && record.error.length > 0) {
    return record.error
  }

  const original = asRecord(record.originalError)
  if (original && typeof original.error === 'string') {
    return original.error
  }

  return null
}

export function parseRouteVoiceReportRestErrorBody(
  body: unknown,
  status: number,
): { code: string; message?: string } {
  const code = readErrorCode(body)
  if (code) {
    const record = asRecord(body)
    const message =
      typeof record?.message === 'string' ? record.message : undefined
    return { code, message }
  }

  const fallback = STATUS_CODE_FALLBACKS[status]
  if (fallback) {
    return { code: fallback }
  }

  return { code: 'UNKNOWN' }
}

/** Map a stable error code to a bounded i18n message. Never surfaces raw backend text. */
export function mapRouteVoiceReportErrorCode(
  code: string | null | undefined,
): string {
  if (!code) {
    return translate('routeVoiceReports.error.uploadFailed')
  }

  const key = ERROR_CODE_KEYS[code]
  if (key) {
    return translate(key)
  }

  return translate('routeVoiceReports.error.uploadFailed')
}

/** Map transcription failure codes for display (FAILED state). */
export function mapTranscriptionFailureCode(
  code: string | null | undefined,
): string {
  if (!code) {
    return translate('routeVoiceReports.transcription.failed')
  }

  const key = ERROR_CODE_KEYS[code]
  if (key) {
    return translate(key)
  }

  return translate('routeVoiceReports.transcription.failed')
}
