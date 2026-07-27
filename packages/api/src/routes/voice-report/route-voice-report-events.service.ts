import { Inject, Injectable } from '@nestjs/common'
import { PubSub } from 'graphql-subscriptions'

import { PUB_SUB, ROUTE_VOICE_REPORT_CREATED_EVENT } from '../../common/pubsub/pubsub.constants'
import { ROUTE_VOICE_REPORT_EVENT_TYPE_CREATED } from './route-voice-report.constants'
import { RouteVoiceReportStatus } from './route-voice-report-status.enum'

export type RouteVoiceReportCreatedEventPayload = {
  routeVoiceReportUpdates: {
    routeId: string
    reportId: string
    status: RouteVoiceReportStatus
    eventType: typeof ROUTE_VOICE_REPORT_EVENT_TYPE_CREATED
  }
}

/**
 * Redacted PubSub publisher for voice-report creation.
 * Payload never includes blob names, hashes, tokens, or user IDs.
 */
@Injectable()
export class RouteVoiceReportEventsService {
  constructor(@Inject(PUB_SUB) private readonly pubSub: PubSub) {}

  async publishCreated(input: {
    routeId: string
    reportId: string
    status: RouteVoiceReportStatus
  }): Promise<void> {
    const payload: RouteVoiceReportCreatedEventPayload = {
      routeVoiceReportUpdates: {
        routeId: input.routeId,
        reportId: input.reportId,
        status: input.status,
        eventType: ROUTE_VOICE_REPORT_EVENT_TYPE_CREATED,
      },
    }
    await this.pubSub.publish(ROUTE_VOICE_REPORT_CREATED_EVENT, payload)
  }
}
