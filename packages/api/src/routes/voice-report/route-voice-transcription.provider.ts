import { RouteVoiceTranscriptionLocale } from './route-voice-transcription-locale.enum'

export const ROUTE_VOICE_TRANSCRIPTION_PROVIDER = Symbol(
  'ROUTE_VOICE_TRANSCRIPTION_PROVIDER',
)

export type RouteVoiceTranscriptionRequest = {
  audioBytes: Buffer
  mimeType: string
  requestedLocale: RouteVoiceTranscriptionLocale
  fileNameHint: string
  correlationId: string
}

export type RouteVoiceTranscriptionProviderResult = {
  text: string
  detectedLocale: string | null
  confidence: number | null
  audioDurationSeconds: number | null
  providerRequestId: string | null
}

/**
 * Provider-neutral speech transcription port (Phase 34B).
 * Domain services must not depend on Azure SDK / REST response types.
 */
export interface RouteVoiceTranscriptionProvider {
  transcribe(
    input: RouteVoiceTranscriptionRequest,
  ): Promise<RouteVoiceTranscriptionProviderResult>
}
