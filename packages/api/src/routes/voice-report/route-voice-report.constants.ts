/** Centralised Phase 34A route voice-report limits. */

export const ROUTE_VOICE_REPORT_MAX_REPORTS_PER_ROUTE = 20
export const ROUTE_VOICE_REPORT_MAX_AUDIO_BYTES = 10 * 1024 * 1024
export const ROUTE_VOICE_REPORT_MIN_DURATION_SECONDS = 1
export const ROUTE_VOICE_REPORT_MAX_DURATION_SECONDS = 180

export const ROUTE_VOICE_REPORT_MAX_SELECTED_LOCALE_LENGTH = 16
export const ROUTE_VOICE_REPORT_MAX_CLIENT_UPLOAD_ID_LENGTH = 64
export const ROUTE_VOICE_REPORT_MIN_CLIENT_UPLOAD_ID_LENGTH = 8
export const ROUTE_VOICE_REPORT_MAX_BROWSER_FORMAT_LABEL_LENGTH = 64
export const ROUTE_VOICE_REPORT_MAX_CLIENT_RECORDED_AT_LENGTH = 64

/** Allow client clocks slightly ahead of the server. */
export const ROUTE_VOICE_REPORT_FUTURE_SKEW_MS = 5 * 60 * 1000

/** Stale UPLOADING reservations older than this may be recovered/cleaned. */
export const ROUTE_VOICE_REPORT_STALE_UPLOADING_MS = 15 * 60 * 1000

/** Logical private Azure container identifier (non-secret). */
export const ROUTE_VOICE_REPORT_DEFAULT_CONTAINER_NAME = 'route-voice-reports'

export const ROUTE_VOICE_REPORT_CACHE_CONTROL = 'private, no-store'
export const ROUTE_VOICE_REPORT_CONTENT_DISPOSITION_PREFIX =
  'inline; filename="route-report-'

export const ROUTE_VOICE_REPORT_EVENT_TYPE_CREATED =
  'ROUTE_VOICE_REPORT_CREATED' as const

export {
  ROUTE_VOICE_TRANSCRIPTION_EVENT_TYPE_PENDING,
  ROUTE_VOICE_TRANSCRIPTION_EVENT_TYPE_PROCESSING,
  ROUTE_VOICE_TRANSCRIPTION_EVENT_TYPE_COMPLETED,
  ROUTE_VOICE_TRANSCRIPTION_EVENT_TYPE_FAILED,
  ROUTE_VOICE_TRANSCRIPTION_EVENT_TYPE_RETRIED,
} from './route-voice-transcription.constants'

export function buildRouteVoiceReportAudioPath(
  routeId: string,
  reportId: string,
): string {
  return `/delivery-routes/${encodeURIComponent(routeId)}/voice-reports/${encodeURIComponent(reportId)}/audio`
}

export function buildRouteVoiceReportUploadPath(routeId: string): string {
  return `/delivery-routes/${encodeURIComponent(routeId)}/voice-reports`
}
