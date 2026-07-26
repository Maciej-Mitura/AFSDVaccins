import { Parent, ResolveField, Resolver } from '@nestjs/graphql'

import { CurrentUser } from '../../user/decorators/current-user.decorator'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { BezorgerProfileService } from '../../profile/bezorger/bezorger-profile.service'
import { DeliveryRoute } from '../delivery-route.entity'
import { DeliveryRouteProgressLocationService } from './delivery-route-progress-location.service'
import { RouteLocationStatus } from './route-location-status.type'

/**
 * Safe route location projection (Phase 30A).
 * Never exposes eventId, Firebase UID, coordinates, or private profile ids.
 */
@Resolver(() => DeliveryRoute)
export class DeliveryRouteLocationFieldsResolver {
  constructor(
    private readonly progressLocationService: DeliveryRouteProgressLocationService,
    private readonly bezorgerProfileService: BezorgerProfileService,
  ) {}

  @ResolveField(() => RouteLocationStatus, {
    nullable: true,
    description:
      'Coarse courier city + derived next-stop summary for ADMIN and assigned BEZORGER. Null for unauthorised actors.',
  })
  async locationStatus(
    @Parent() route: DeliveryRoute,
    @CurrentUser() user: User,
  ): Promise<RouteLocationStatus | null> {
    if (!user) {
      return null
    }

    if (user.role === UserRole.ADMIN) {
      return this.progressLocationService.buildSafeLocationStatus(route)
    }

    if (user.role === UserRole.BEZORGER) {
      const profile = await this.bezorgerProfileService.findByUserId(
        user._id.toString(),
      )
      if (!profile) {
        return null
      }
      return this.progressLocationService.getSafeLocationForActor(route, user, {
        assignedBezorgerProfileId: profile.id.toString(),
      })
    }

    return null
  }
}
