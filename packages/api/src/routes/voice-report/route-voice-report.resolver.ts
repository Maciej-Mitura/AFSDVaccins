import { Inject, UseGuards } from '@nestjs/common'
import { Args, ID, Query, Resolver, Subscription } from '@nestjs/graphql'
import { PubSub } from 'graphql-subscriptions'

import { AuthorizationGuard } from '../../authentication/authorization.guard'
import { GraphqlRequestContext } from '../../authentication/firebase.types'
import {
  PUB_SUB,
  ROUTE_VOICE_REPORT_CREATED_EVENT,
} from '../../common/pubsub/pubsub.constants'
import { StrictThrottle } from '../../common/throttling/strict-rate-limit.decorator'
import { StrictIdentityThrottlerGuard } from '../../common/throttling/strict-identity-throttler.guard'
import { CurrentUser } from '../../user/decorators/current-user.decorator'
import { Roles } from '../../user/decorators/roles.decorator'
import { RolesGuard } from '../../user/guards/roles.guard'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { RouteVoiceReportService } from './route-voice-report.service'
import {
  RouteVoiceReportGql,
  RouteVoiceReportUpdateGql,
} from './route-voice-report.type'
import type { RouteVoiceReportUpdateEventPayload } from './route-voice-report-events.service'

@Resolver(() => RouteVoiceReportGql)
export class RouteVoiceReportResolver {
  constructor(
    private readonly voiceReportService: RouteVoiceReportService,
    @Inject(PUB_SUB) private readonly pubSub: PubSub,
  ) {}

  @Query(() => [RouteVoiceReportGql], {
    description:
      'Lists AVAILABLE voice reports for a generated delivery route (ADMIN or assigned BEZORGER)',
  })
  @UseGuards(AuthorizationGuard, RolesGuard, StrictIdentityThrottlerGuard)
  @StrictThrottle()
  @Roles(UserRole.ADMIN, UserRole.BEZORGER)
  routeVoiceReports(
    @CurrentUser() user: User,
    @Args('routeId', { type: () => ID }) routeId: string,
  ): Promise<RouteVoiceReportGql[]> {
    return this.voiceReportService.listForActor(user, routeId)
  }

  @Subscription(() => RouteVoiceReportUpdateGql, {
    description:
      'Redacted voice-report create/transcription events. ADMIN (any route) or assigned BEZORGER only. Payload never includes transcript text.',
    resolve: (payload: RouteVoiceReportUpdateEventPayload) =>
      payload.routeVoiceReportUpdates,
    filter: async function (
      this: RouteVoiceReportResolver,
      payload: RouteVoiceReportUpdateEventPayload,
      _variables: unknown,
      context: GraphqlRequestContext,
    ): Promise<boolean> {
      return this.voiceReportService.filterVoiceReportUpdateForSubscriber(
        context,
        payload.routeVoiceReportUpdates.routeId,
      )
    },
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BEZORGER)
  routeVoiceReportUpdates(): AsyncIterator<RouteVoiceReportUpdateEventPayload> {
    return this.pubSub.asyncIterableIterator(
      ROUTE_VOICE_REPORT_CREATED_EVENT,
    ) as AsyncIterator<RouteVoiceReportUpdateEventPayload>
  }
}
