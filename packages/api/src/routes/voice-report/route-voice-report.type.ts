import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql'

import { RouteVoiceReportStatus } from './route-voice-report-status.enum'

/**
 * Safe GraphQL / REST output for a route voice report.
 * Excludes blobName, containerName, sha256, recordedByUserId, storage URLs.
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
}

@ObjectType('RouteVoiceReportUpdate')
export class RouteVoiceReportUpdateGql {
  @Field(() => ID)
  routeId!: string

  @Field(() => ID)
  reportId!: string

  @Field(() => RouteVoiceReportStatus)
  status!: RouteVoiceReportStatus

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
}
