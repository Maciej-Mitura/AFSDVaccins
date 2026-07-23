import { Inject, UseGuards } from '@nestjs/common'
import {
  Args,
  ID,
  Mutation,
  Query,
  Resolver,
  Subscription,
} from '@nestjs/graphql'
import { PubSub } from 'graphql-subscriptions'

import { AuthorizationGuard } from '../authentication/authorization.guard'
import { GraphqlRequestContext } from '../authentication/firebase.types'
import {
  BEZORGER_ROUTE_UPDATED_EVENT,
  PUB_SUB,
} from '../common/pubsub/pubsub.constants'
import { StrictThrottle } from '../common/throttling/strict-rate-limit.decorator'
import { StrictIdentityThrottlerGuard } from '../common/throttling/strict-identity-throttler.guard'
import { CurrentUser } from '../user/decorators/current-user.decorator'
import { Roles } from '../user/decorators/roles.decorator'
import { RolesGuard } from '../user/guards/roles.guard'
import { User } from '../user/user.entity'
import { UserRole } from '../user/user-role.enum'
import { DeliveryRoute } from './delivery-route.entity'
import { RoutePreview } from './route-preview.type'
import { RouteStatus } from './route-status.enum'
import { RoutesService } from './routes.service'

@Resolver(() => DeliveryRoute)
export class RoutesResolver {
  constructor(
    private readonly routesService: RoutesService,
    @Inject(PUB_SUB) private readonly pubSub: PubSub,
  ) {}

  @Mutation(() => DeliveryRoute, {
    description:
      'Generates or regenerates a delivery route from an active template',
  })
  @UseGuards(AuthorizationGuard, RolesGuard, StrictIdentityThrottlerGuard)
  @StrictThrottle()
  @Roles(UserRole.ADMIN)
  generateDeliveryRoute(
    @CurrentUser() user: User,
    @Args('routeTemplateId', { type: () => ID }) routeTemplateId: string,
    @Args('deliveryDate') deliveryDate: string,
  ): Promise<DeliveryRoute> {
    return this.routesService.generateDeliveryRoute(
      user,
      routeTemplateId,
      deliveryDate,
    )
  }

  @Query(() => [DeliveryRoute], {
    description: 'Lists delivery routes for administrators',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  deliveryRoutes(
    @Args('deliveryDate', { nullable: true }) deliveryDate?: string,
    @Args('bezorgerProfileId', { type: () => ID, nullable: true })
    bezorgerProfileId?: string,
  ): Promise<DeliveryRoute[]> {
    return this.routesService.findDeliveryRoutes({
      deliveryDate,
      bezorgerProfileId,
    })
  }

  @Query(() => DeliveryRoute, {
    description: 'Returns a delivery route by id',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  deliveryRoute(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<DeliveryRoute> {
    return this.routesService.findDeliveryRouteById(id)
  }

  @Mutation(() => DeliveryRoute, {
    description:
      'Updates delivery route status according to the route execution state machine',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BEZORGER)
  updateRouteStatus(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
    @Args('status', { type: () => RouteStatus }) status: RouteStatus,
    @Args('reason', { nullable: true }) reason?: string,
  ): Promise<DeliveryRoute> {
    return this.routesService.updateRouteStatus(user, id, status, reason)
  }

  @Query(() => DeliveryRoute, {
    nullable: true,
    description:
      'Returns the authenticated bezorger route for the Europe/Brussels today date',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.BEZORGER)
  myTodayRoute(@CurrentUser() user: User): Promise<DeliveryRoute | null> {
    return this.routesService.findMyTodayRoute(user)
  }

  @Query(() => RoutePreview, {
    description:
      'Computed non-persisted tomorrow route preview for the authenticated bezorger',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.BEZORGER)
  myTomorrowRoutePreview(@CurrentUser() user: User): Promise<RoutePreview> {
    return this.routesService.findMyTomorrowRoutePreview(user)
  }

  @Subscription(() => DeliveryRoute, {
    description: 'Live route updates for the authenticated bezorger',
    filter: async function (
      this: RoutesResolver,
      payload: { bezorgerRouteUpdates: DeliveryRoute },
      _variables: unknown,
      context: GraphqlRequestContext,
    ) {
      return this.routesService.filterRouteUpdateForSubscriber(
        context,
        payload.bezorgerRouteUpdates,
      )
    },
    resolve: (payload: { bezorgerRouteUpdates: DeliveryRoute }) =>
      payload.bezorgerRouteUpdates,
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.BEZORGER)
  bezorgerRouteUpdates() {
    return this.pubSub.asyncIterableIterator(BEZORGER_ROUTE_UPDATED_EVENT)
  }
}
