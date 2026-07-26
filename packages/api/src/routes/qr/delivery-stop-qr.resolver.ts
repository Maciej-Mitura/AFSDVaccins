import { UseGuards } from '@nestjs/common'
import { Args, ID, Query, Resolver } from '@nestjs/graphql'

import { AuthorizationGuard } from '../../authentication/authorization.guard'
import { StrictThrottle } from '../../common/throttling/strict-rate-limit.decorator'
import { StrictIdentityThrottlerGuard } from '../../common/throttling/strict-identity-throttler.guard'
import { CurrentUser } from '../../user/decorators/current-user.decorator'
import { Roles } from '../../user/decorators/roles.decorator'
import { RolesGuard } from '../../user/guards/roles.guard'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { DeliveryStopQrRetrievalService } from './delivery-stop-qr-retrieval.service'
import { DeliveryStopQr } from './delivery-stop-qr.type'
import { MyPlannedDeliveriesService } from './my-planned-deliveries.service'
import { MyPlannedDelivery } from './my-planned-delivery.type'

@Resolver(() => DeliveryStopQr)
export class DeliveryStopQrResolver {
  constructor(
    private readonly retrievalService: DeliveryStopQrRetrievalService,
    private readonly plannedDeliveriesService: MyPlannedDeliveriesService,
  ) {}

  @Query(() => DeliveryStopQr, {
    description:
      'Safe pharmacy/admin metadata for a generated stop QR (no bearer token).',
  })
  @UseGuards(AuthorizationGuard, RolesGuard, StrictIdentityThrottlerGuard)
  @StrictThrottle()
  @Roles(UserRole.ADMIN, UserRole.APOTHEKER)
  deliveryStopQr(
    @CurrentUser() user: User,
    @Args('routeId', { type: () => ID }) routeId: string,
    @Args('stopId', { type: () => ID }) stopId: string,
  ): Promise<DeliveryStopQr> {
    return this.retrievalService.getSafeStopQrMetadata(user, routeId, stopId)
  }

  @Query(() => [MyPlannedDelivery], {
    description:
      'Stop-grouped planned deliveries for the authenticated pharmacist (no bearer token).',
  })
  @UseGuards(AuthorizationGuard, RolesGuard, StrictIdentityThrottlerGuard)
  @StrictThrottle()
  @Roles(UserRole.APOTHEKER)
  myPlannedDeliveries(
    @CurrentUser() user: User,
  ): Promise<MyPlannedDelivery[]> {
    return this.plannedDeliveriesService.listForApotheker(user)
  }
}
