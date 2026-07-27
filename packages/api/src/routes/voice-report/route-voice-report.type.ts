import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql'

import { RouteVoiceReportStatus } from './route-voice-report-status.enum'
import { RouteVoiceTranscriptionLocale } from './route-voice-transcription-locale.enum'
import { RouteVoiceTranscriptionStatus } from './route-voice-transcription-status.enum'

/**
 * Safe GraphQL / REST output for a route voice report (Phase 34A + 34B).
 * Excludes blobName, containerName, sha256, recordedByUserId, storage URLs,
 * lease IDs, providerRequestId, and raw failure messages.
 */
@ObjectType('RouteVoiceReport')
export class RouteVoiceReportGql {
  @Field(() => ID)
  id!: string

  @Field(() => ID)
  routeId!: string

  @Field(() => Int)
  sequenceNumber!: number

  @Field(() => RouteVoiceReportStatus)
  status!: RouteVoiceReportStatus

  @Field()
  mimeType!: string

  /** Client-declared duration (untrusted). Prefer effectiveDurationSeconds. */
  @Field(() => Float)
  durationSeconds!: number

  @Field(() => String, { nullable: true })
  selectedLocale!: string | null

  @Field()
  clientRecordedAt!: Date

  @Field()
  uploadedAt!: Date

  @Field()
  recordedByDisplayName!: string

  @Field()
  canPlayAudio!: boolean

  @Field(() => RouteVoiceTranscriptionStatus, { nullable: true })
  transcriptionStatus!: RouteVoiceTranscriptionStatus | null

  @Field(() => RouteVoiceTranscriptionLocale, { nullable: true })
  requestedLocale!: RouteVoiceTranscriptionLocale | null

  @Field(() => String, { nullable: true })
  detectedLocale!: string | null

  @Field(() => String, { nullable: true })
  transcript!: string | null

  @Field(() => Float, { nullable: true })
  confidence!: number | null

  @Field(() => Date, { nullable: true })
  transcriptionStartedAt!: Date | null

  @Field(() => Date, { nullable: true })
  transcriptionCompletedAt!: Date | null

  @Field(() => String, { nullable: true })
  transcriptionFailureCode!: string | null

  /** Azure duration when present; otherwise client-declared durationSeconds. */
  @Field(() => Float)
  effectiveDurationSeconds!: number

  /** ADMIN only; false for couriers even when FAILED. */
  @Field()
  canRetryTranscription!: boolean
}

@ObjectType('RouteVoiceReportUpdate')
export class RouteVoiceReportUpdateGql {
  @Field(() => ID)
  routeId!: string

  @Field(() => ID)
  reportId!: string

  @Field(() => RouteVoiceReportStatus)
  status!: RouteVoiceReportStatus

  @Field(() => RouteVoiceTranscriptionStatus, { nullable: true })
  transcriptionStatus!: RouteVoiceTranscriptionStatus | null

  @Field(() => String)
  eventType!: string
}

export type RouteVoiceReportUploadResponseDto = {
  id: string
  routeId: string
  sequenceNumber: number
  status: RouteVoiceReportStatus
  mimeType: string
  sizeBytes: number
  durationSeconds: number
  clientRecordedAt: string
  uploadedAt: string
  selectedLocale: string | null
  canPlayAudio: boolean
  transcriptionStatus: RouteVoiceTranscriptionStatus | null
  requestedLocale: RouteVoiceTranscriptionLocale | null
  effectiveDurationSeconds: number
}

export type RouteVoiceTranscriptionRetryResponseDto = {
  reportId: string
  transcriptionStatus: 'PENDING'
}
