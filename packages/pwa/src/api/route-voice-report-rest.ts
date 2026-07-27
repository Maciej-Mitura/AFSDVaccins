import { resolveAuthBearerToken } from '@/firebase/auth-session'
import { resolveBackendRestOrigin } from '@/api/vaccine-image-rest'
import {
  RouteVoiceReportRestError,
  parseRouteVoiceReportRestErrorBody,
} from '@/api/route-voice-report-errors'

/** Max audio upload size — mirrors backend `ROUTE_VOICE_REPORT_MAX_AUDIO_BYTES`. */
export const ROUTE_VOICE_REPORT_MAX_AUDIO_BYTES = 10 * 1024 * 1024

export const ROUTE_VOICE_REPORT_MIN_DURATION_SECONDS = 1
export const ROUTE_VOICE_REPORT_MAX_DURATION_SECONDS = 180
export const ROUTE_VOICE_REPORT_WARN_DURATION_SECONDS = 150

/** Allow-listed audio Content-Types for authenticated playback Blob creation. */
export const ROUTE_VOICE_REPORT_PLAYBACK_MIME_ALLOWLIST = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/mpeg',
] as const

export type RouteVoiceReportSelectedLocale =
  'AUTO' | 'en-GB' | 'nl-NL' | 'pl-PL'

export type RouteVoiceReportUploadPayload = {
  audio: Blob
  clientRecordedAt: string
  durationSeconds: number
  selectedLocale: RouteVoiceReportSelectedLocale
  clientUploadId: string
  /** Optional filename hint for multipart (extension only; not persisted as original name). */
  filename?: string
}

export type RouteVoiceReportUploadResponse = {
  id: string
  routeId: string
  sequenceNumber: number
  status: string
  mimeType: string
  sizeBytes: number
  durationSeconds: number
  clientRecordedAt: string
  uploadedAt: string
  selectedLocale: string | null
  canPlayAudio: boolean
  transcriptionStatus: string | null
  requestedLocale: string | null
  effectiveDurationSeconds: number
}

export type RouteVoiceTranscriptionRetryResponse = {
  reportId: string
  transcriptionStatus: 'PENDING'
}

export type AuthenticatedAudioFetchResult = {
  blob: Blob
  contentType: string
}

function voiceReportsUrl(routeId: string): string {
  const origin = resolveBackendRestOrigin()
  return `${origin}/delivery-routes/${encodeURIComponent(routeId)}/voice-reports`
}

function voiceReportAudioUrl(routeId: string, reportId: string): string {
  return `${voiceReportsUrl(routeId)}/${encodeURIComponent(reportId)}/audio`
}

function voiceReportRetryUrl(routeId: string, reportId: string): string {
  return `${voiceReportsUrl(routeId)}/${encodeURIComponent(reportId)}/retry-transcription`
}

async function readErrorResponse(
  response: Response,
): Promise<RouteVoiceReportRestError> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }

  const parsed = parseRouteVoiceReportRestErrorBody(body, response.status)
  return new RouteVoiceReportRestError(
    response.status,
    parsed.code,
    parsed.message,
  )
}

async function authorizedFetch(
  url: string,
  init: RequestInit,
  authRetry = false,
): Promise<Response> {
  const token = await resolveAuthBearerToken(authRetry)

  if (!token) {
    throw new RouteVoiceReportRestError(401, 'UNAUTHENTICATED')
  }

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(url, {
    ...init,
    headers,
    cache: 'no-store',
  })

  if (response.status === 401 && !authRetry) {
    return authorizedFetch(url, init, true)
  }

  return response
}

function normaliseContentType(header: string | null): string {
  if (!header) {
    return ''
  }
  return header.split(';')[0]?.trim().toLowerCase() ?? ''
}

export function isAllowedPlaybackContentType(contentType: string): boolean {
  const normalised = normaliseContentType(contentType)
  if (!normalised) {
    return false
  }
  return (
    ROUTE_VOICE_REPORT_PLAYBACK_MIME_ALLOWLIST as readonly string[]
  ).includes(normalised)
}

function extensionForMime(mimeType: string): string {
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (base.includes('ogg')) {
    return 'ogg'
  }
  if (base.includes('mp4') || base.includes('m4a') || base.includes('aac')) {
    return 'm4a'
  }
  return 'webm'
}

/**
 * Upload a courier voice report (multipart). Do not set Content-Type manually.
 */
export async function uploadRouteVoiceReport(
  routeId: string,
  payload: RouteVoiceReportUploadPayload,
): Promise<RouteVoiceReportUploadResponse> {
  const formData = new FormData()
  const mime = payload.audio.type || 'application/octet-stream'
  const filename = payload.filename ?? `voice-report.${extensionForMime(mime)}`
  formData.append('audio', payload.audio, filename)
  formData.append('clientRecordedAt', payload.clientRecordedAt)
  formData.append('durationSeconds', String(payload.durationSeconds))
  formData.append('selectedLocale', payload.selectedLocale)
  formData.append('clientUploadId', payload.clientUploadId)

  let response: Response
  try {
    response = await authorizedFetch(voiceReportsUrl(routeId), {
      method: 'POST',
      body: formData,
    })
  } catch (error: unknown) {
    if (error instanceof RouteVoiceReportRestError) {
      throw error
    }
    throw new RouteVoiceReportRestError(0, 'NETWORK_ERROR')
  }

  if (!response.ok) {
    throw await readErrorResponse(response)
  }

  return (await response.json()) as RouteVoiceReportUploadResponse
}

/**
 * Fetch private audio bytes with Firebase bearer auth.
 * Returns a Blob suitable for createObjectURL — never put the REST URL in <audio src>.
 */
export async function fetchRouteVoiceReportAudio(
  routeId: string,
  reportId: string,
): Promise<AuthenticatedAudioFetchResult> {
  let response: Response
  try {
    response = await authorizedFetch(voiceReportAudioUrl(routeId, reportId), {
      method: 'GET',
    })
  } catch (error: unknown) {
    if (error instanceof RouteVoiceReportRestError) {
      throw error
    }
    throw new RouteVoiceReportRestError(0, 'NETWORK_ERROR')
  }

  if (!response.ok) {
    throw await readErrorResponse(response)
  }

  const contentType = response.headers.get('Content-Type') ?? ''
  if (!isAllowedPlaybackContentType(contentType)) {
    throw new RouteVoiceReportRestError(415, 'INVALID_AUDIO_RESPONSE')
  }

  const blob = await response.blob()
  return {
    blob,
    contentType: normaliseContentType(contentType),
  }
}

/** ADMIN-only transcription retry. Returns 202 semantics as JSON body. */
export async function retryRouteVoiceReportTranscription(
  routeId: string,
  reportId: string,
): Promise<RouteVoiceTranscriptionRetryResponse> {
  let response: Response
  try {
    response = await authorizedFetch(voiceReportRetryUrl(routeId, reportId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
  } catch (error: unknown) {
    if (error instanceof RouteVoiceReportRestError) {
      throw error
    }
    throw new RouteVoiceReportRestError(0, 'NETWORK_ERROR')
  }

  if (!response.ok) {
    throw await readErrorResponse(response)
  }

  return (await response.json()) as RouteVoiceTranscriptionRetryResponse
}
