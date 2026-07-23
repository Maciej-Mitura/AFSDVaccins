import { UseGuards } from '@nestjs/common'
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'

import { AuthorizationGuard } from '../../authentication/authorization.guard'
import { StrictThrottle } from '../../common/throttling/strict-rate-limit.decorator'
import { StrictIdentityThrottlerGuard } from '../../common/throttling/strict-identity-throttler.guard'
import { CurrentUser } from '../../user/decorators/current-user.decorator'
import { Roles } from '../../user/decorators/roles.decorator'
import { RolesGuard } from '../../user/guards/roles.guard'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { BezorgerProfile } from './bezorger-profile.entity'
import { BezorgerProfileService } from './bezorger-profile.service'
import {
  CompleteBezorgerProfileInput,
  UpdateOwnBezorgerProfileInput,
} from './dto/bezorger-profile.inputs'

@Resolver(() => BezorgerProfile)
export class BezorgerProfileResolver {
  constructor(
    private readonly bezorgerProfileService: BezorgerProfileService,
  ) {}

  @Query(() => BezorgerProfile, {
    nullable: true,
    description: 'Returns the authenticated bezorger courier profile',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.BEZORGER)
  currentBezorgerProfile(
    @CurrentUser() user: User,
  ): Promise<BezorgerProfile | null> {
    return this.bezorgerProfileService.findByUserId(user._id.toString())
  }

  @Query(() => [BezorgerProfile], {
    description: 'Lists all bezorger courier profiles (ADMIN)',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  bezorgerProfiles(): Promise<BezorgerProfile[]> {
    return this.bezorgerProfileService.listBezorgerProfiles()
  }

  @Mutation(() => BezorgerProfile, {
    description:
      'Creates the bezorger courier profile for the authenticated BEZORGER (idempotent)',
  })
  @UseGuards(AuthorizationGuard, RolesGuard, StrictIdentityThrottlerGuard)
  @StrictThrottle()
  @Roles(UserRole.BEZORGER)
  completeBezorgerProfile(
    @CurrentUser() user: User,
    @Args('input') input: CompleteBezorgerProfileInput,
  ): Promise<BezorgerProfile> {
    return this.bezorgerProfileService.completeOwnProfile(user, input)
  }

  @Mutation(() => BezorgerProfile, {
    description: 'Updates the authenticated bezorger courier profile',
  })
  @UseGuards(AuthorizationGuard, RolesGuard, StrictIdentityThrottlerGuard)
  @StrictThrottle()
  @Roles(UserRole.BEZORGER)
  updateOwnBezorgerProfile(
    @CurrentUser() user: User,
    @Args('input') input: UpdateOwnBezorgerProfileInput,
  ): Promise<BezorgerProfile> {
    return this.bezorgerProfileService.updateOwnProfile(user, input)
  }
}
