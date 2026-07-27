import { Inject, Injectable } from '@nestjs/common'
import { PubSub } from 'graphql-subscriptions'

import {
  PUB_SUB,
  ROUTE_VOICE_REPORT_CREATED_EVENT,
} from '../../common/pubsub/pubsub.constants'
import {
  ROUTE_VOICE_REPORT_EVENT_TYPE_CREATED,
  ROUTE_VOICE_TRANSCRIPTION_EVENT_TYPE_COMPLETED,
  ROUTE_VOICE_TRANSCRIPTION_EVENT_TYPE_FAILED,
  ROUTE_VOICE_TRANSCRIPTION_EVENT_TYPE_PENDING,
  ROUTE_VOICE_TRANSCRIPTION_EVENT_TYPE_PROCESSING,
  ROUTE_VOICE_TRANSCRIPTION_EVENT_TYPE_RETRIED,
} from './route-voice-report.constants'
import { RouteVoiceReportStatus } from './route-voice-report-status.enum'
import { RouteVoiceTranscriptionStatus } from './route-voice-transcription-status.enum'

export type RouteVoiceReportUpdateEventType =
  | typeof ROUTE_VOICE_REPORT_EVENT_TYPE_CREATED
  | typeof ROUTE_VOICE_TRANSCRIPTION_EVENT_TYPE_PENDING
  | typeof ROUTE_VOICE_TRANSCRIPTION_EVENT_TYPE_PROCESSING
  | typeof ROUTE_VOICE_TRANSCRIPTION_EVENT_TYPE_COMPLETED
  | typeof ROUTE_VOICE_TRANSCRIPTION_EVENT_TYPE_FAILED
  | typeof ROUTE_VOICE_TRANSCRIPTION_EVENT_TYPE_RETRIED

export type RouteVoiceReportUpdateEventPayload = {
  routeVoiceReportUpdates: {
    routeId: string
    reportId: string
    status: RouteVoiceReportStatus
    transcriptionStatus: RouteVoiceTranscriptionStatus | null
    eventType: RouteVoiceReportUpdateEventType
  }
}

/** @deprecated Use RouteVoiceReportUpdateEventPayload */
export type RouteVoiceReportCreatedEventPayload =
  RouteVoiceReportUpdateEventPayload

/**
 * Redacted PubSub publisher for voice-report create + transcription updates.
 * Payload never includes transcript text, blob names, hashes, tokens, or user IDs.
 */
@Injectable()
export class RouteVoiceReportEventsService {
  constructor(@Inject(PUB_SUB) private readonly pubSub: PubSub) {}

  async publishCreated(input: {
    routeId: string
    reportId: string
    status: RouteVoiceReportStatus
    transcriptionStatus?: RouteVoiceTranscriptionStatus | null
  }): Promise<void> {
    await this.publish({
      routeId: input.routeId,
      reportId: input.reportId,
      status: input.status,
      transcriptionStatus:
        input.transcriptionStatus ?? RouteVoiceTranscriptionStatus.PENDING,
      eventType: ROUTE_VOICE_REPORT_EVENT_TYPE_CREATED,
    })
  }

  async publishTranscriptionUpdate(input: {
    routeId: string
    reportId: string
    status: RouteVoiceReportStatus
    transcriptionStatus: RouteVoiceTranscriptionStatus
    eventType:
      | typeof ROUTE_VOICE_TRANSCRIPTION_EVENT_TYPE_PENDING
      | typeof ROUTE_VOICE_TRANSCRIPTION_EVENT_TYPE_PROCESSING
      | typeof ROUTE_VOICE_TRANSCRIPTION_EVENT_TYPE_COMPLETED
      | typeof ROUTE_VOICE_TRANSCRIPTION_EVENT_TYPE_FAILED
      | typeof ROUTE_VOICE_TRANSCRIPTION_EVENT_TYPE_RETRIED
  }): Promise<void> {
    await this.publish(input)
  }

  private async publish(input: {
    routeId: string
    reportId: string
    status: RouteVoiceReportStatus
    transcriptionStatus: RouteVoiceTranscriptionStatus | null
    eventType: RouteVoiceReportUpdateEventType
  }): Promise<void> {
    const payload: RouteVoiceReportUpdateEventPayload = {
      routeVoiceReportUpdates: {
        routeId: input.routeId,
        reportId: input.reportId,
        status: input.status,
        transcriptionStatus: input.transcriptionStatus,
        eventType: input.eventType,
      },
    }
    // Same GraphQL subscription channel as Phase 34A (clients refetch).
    await this.pubSub.publish(ROUTE_VOICE_REPORT_CREATED_EVENT, payload)
  }
}
