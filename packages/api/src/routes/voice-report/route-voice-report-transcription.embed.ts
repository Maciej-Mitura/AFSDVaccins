import { Column } from 'typeorm'

import { RouteVoiceTranscriptionLocale } from './route-voice-transcription-locale.enum'
import {
  ROUTE_VOICE_TRANSCRIPTION_PROVIDER_NAME,
} from './route-voice-transcription.constants'
import { RouteVoiceTranscriptionStatus } from './route-voice-transcription-status.enum'

/**
 * Nested transcription metadata embedded on RouteVoiceReport (Phase 34B).
 * Never stores raw Azure responses, keys, or word-level timings.
 */
export class RouteVoiceReportTranscription {
  @Column()
  status!: RouteVoiceTranscriptionStatus

  @Column()
  provider!: typeof ROUTE_VOICE_TRANSCRIPTION_PROVIDER_NAME

  @Column()
  requestedLocale!: RouteVoiceTranscriptionLocale

  @Column({ nullable: true })
  detectedLocale!: string | null

  @Column({ nullable: true })
  text!: string | null

  @Column({ nullable: true })
  confidence!: number | null

  /** Azure-derived duration when available; does not overwrite client durationSeconds. */
  @Column({ nullable: true })
  audioDurationSeconds!: number | null

  @Column({ nullable: true })
  startedAt!: Date | null

  @Column({ nullable: true })
  completedAt!: Date | null

  @Column({ nullable: true })
  lastAttemptAt!: Date | null

  @Column()
  attemptCount!: number

  @Column({ nullable: true })
  failureCode!: string | null

  /** Bounded safe message for ops — never raw Azure text. */
  @Column({ nullable: true })
  failureMessageSafe!: string | null

  @Column({ nullable: true })
  processingLeaseId!: string | null

  @Column({ nullable: true })
  processingLeaseExpiresAt!: Date | null

  /** Safe opaque provider correlation id — never expose via GraphQL. */
  @Column({ nullable: true })
  providerRequestId!: string | null

  @Column()
  transcriptVersion!: number

  /** Increments on each admin manual retry. */
  @Column()
  retryGeneration!: number
}

export function createPendingTranscription(
  requestedLocale: RouteVoiceTranscriptionLocale,
): RouteVoiceReportTranscription {
  return {
    status: RouteVoiceTranscriptionStatus.PENDING,
    provider: ROUTE_VOICE_TRANSCRIPTION_PROVIDER_NAME,
    requestedLocale,
    detectedLocale: null,
    text: null,
    confidence: null,
    audioDurationSeconds: null,
    startedAt: null,
    completedAt: null,
    lastAttemptAt: null,
    attemptCount: 0,
    failureCode: null,
    failureMessageSafe: null,
    processingLeaseId: null,
    processingLeaseExpiresAt: null,
    providerRequestId: null,
    transcriptVersion: 0,
    retryGeneration: 0,
  }
}

/** Resolve effective display duration: Azure preferred, else client-declared. */
export function resolveEffectiveDurationSeconds(input: {
  clientDurationSeconds: number
  transcriptionAudioDurationSeconds: number | null | undefined
}): number {
  const azure = input.transcriptionAudioDurationSeconds
  if (
    typeof azure === 'number' &&
    Number.isFinite(azure) &&
    azure > 0
  ) {
    return azure
  }
  return input.clientDurationSeconds
}

export function mapSelectedLocaleToRequested(
  selectedLocale: string | null | undefined,
): RouteVoiceTranscriptionLocale {
  if (
    selectedLocale === RouteVoiceTranscriptionLocale.EN_GB ||
    selectedLocale === RouteVoiceTranscriptionLocale.NL_NL ||
    selectedLocale === RouteVoiceTranscriptionLocale.PL_PL ||
    selectedLocale === RouteVoiceTranscriptionLocale.AUTO
  ) {
    return selectedLocale
  }
  return RouteVoiceTranscriptionLocale.AUTO
}
