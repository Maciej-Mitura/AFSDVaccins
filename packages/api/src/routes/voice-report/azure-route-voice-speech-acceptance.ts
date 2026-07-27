import { performance } from 'node:perf_hooks'

import {
  AzureRouteVoiceTranscriptionProvider,
  azureSpeechFileNameHintForMime,
} from './azure-route-voice-transcription.provider'
import { isRouteVoiceTranscriptionProviderError } from './azure-route-voice-transcription.errors'
import { validateRouteVoiceReportAudio } from './route-voice-report-audio.validation'
import { RouteVoiceTranscriptionLocale } from './route-voice-transcription-locale.enum'
import {
  readLocalAudioFile,
  redactDiagnosticMessage,
} from './voice-report-azure-diagnostics'
import { ROUTE_VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES } from './route-voice-transcription.constants'

export type VoiceReportSpeechAcceptanceResult = {
  ok: true
  detectedLocale: string | null
  confidence: number | null
  audioDurationSeconds: number | null
  transcript: string
  providerRequestId: string | null
  elapsedMs: number
}

const ALLOWED_LOCALES = new Set(['en-GB', 'nl-NL', 'pl-PL', 'AUTO'])

export function parseSpeechAcceptanceLocale(
  raw: string | undefined,
): RouteVoiceTranscriptionLocale {
  const value = (raw ?? 'AUTO').trim()
  if (!ALLOWED_LOCALES.has(value)) {
    throw new Error(
      'Locale must be one of: en-GB, nl-NL, pl-PL, AUTO',
    )
  }
  return value as RouteVoiceTranscriptionLocale
}

/**
 * Call the production Azure Speech adapter with a local audio file.
 * Prints transcript only for this explicit developer acceptance command.
 * Never uploads to Blob Storage. Never creates Mongo records.
 */
export async function runVoiceReportAzureSpeechAcceptance(input: {
  endpoint: string
  key: string
  timeoutMs: number
  audioPath: string
  locale: RouteVoiceTranscriptionLocale
}): Promise<VoiceReportSpeechAcceptanceResult> {
  const bytes = readLocalAudioFile(input.audioPath)
  if (bytes.length > ROUTE_VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES) {
    throw new Error('Audio exceeds 10 MiB limit')
  }

  const validated = validateRouteVoiceReportAudio({
    bytes,
    declaredMimeType: undefined,
  })

  const provider = AzureRouteVoiceTranscriptionProvider.fromConfig({
    endpoint: input.endpoint,
    key: input.key,
    timeoutMs: input.timeoutMs,
  })

  const started = performance.now()
  try {
    const result = await provider.transcribe({
      audioBytes: validated.bytes,
      mimeType: validated.mimeType,
      requestedLocale: input.locale,
      fileNameHint: azureSpeechFileNameHintForMime(validated.mimeType),
      correlationId: 'azure-speech-acceptance',
    })
    return {
      ok: true,
      detectedLocale: result.detectedLocale,
      confidence: result.confidence,
      audioDurationSeconds: result.audioDurationSeconds,
      transcript: result.text,
      providerRequestId: result.providerRequestId,
      elapsedMs: Math.round(performance.now() - started),
    }
  } catch (error) {
    if (isRouteVoiceTranscriptionProviderError(error)) {
      throw new Error(
        redactDiagnosticMessage(
          `Azure Speech acceptance failed: ${error.kind}`,
        ),
      )
    }
    throw new Error('Azure Speech acceptance failed')
  }
}
