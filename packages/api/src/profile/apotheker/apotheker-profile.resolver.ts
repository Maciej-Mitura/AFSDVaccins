import { UseGuards } from '@nestjs/common'
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'

import { AuthorizationGuard } from '../../authentication/authorization.guard'
import { CurrentUser } from '../../user/decorators/current-user.decorator'
import { Roles } from '../../user/decorators/roles.decorator'
import { RolesGuard } from '../../user/guards/roles.guard'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { ApothekerProfile } from './apotheker-profile.entity'
import { ApothekerProfileService } from './apotheker-profile.service'
import {
  CompleteApothekerProfileInput,
  UpdateOwnApothekerProfileInput,
} from './dto/apotheker-profile.inputs'

@Resolver(() => ApothekerProfile)
export class ApothekerProfileResolver {
  constructor(
    private readonly apothekerProfileService: ApothekerProfileService,
  ) {}

  @Query(() => ApothekerProfile, {
    nullable: true,
    description: 'Returns the authenticated apotheker pharmacy profile',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.APOTHEKER)
  currentApothekerProfile(
    @CurrentUser() user: User,
  ): Promise<ApothekerProfile | null> {
    return this.apothekerProfileService.findByUserId(user._id.toString())
  }

  @Query(() => [ApothekerProfile], {
    description: 'Lists all apotheker pharmacy profiles (ADMIN)',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  apothekerProfiles(): Promise<ApothekerProfile[]> {
    return this.apothekerProfileService.listApothekerProfiles()
  }

  @Mutation(() => ApothekerProfile, {
    description:
      'Creates the apotheker pharmacy profile for the authenticated APOTHEKER (idempotent)',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.APOTHEKER)
  completeApothekerProfile(
    @CurrentUser() user: User,
    @Args('input') input: CompleteApothekerProfileInput,
  ): Promise<ApothekerProfile> {
    return this.apothekerProfileService.completeOwnProfile(user, input)
  }

  @Mutation(() => ApothekerProfile, {
    description: 'Updates the authenticated apotheker pharmacy profile',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.APOTHEKER)
  updateOwnApothekerProfile(
    @CurrentUser() user: User,
    @Args('input') input: UpdateOwnApothekerProfileInput,
  ): Promise<ApothekerProfile> {
    return this.apothekerProfileService.updateOwnProfile(user, input)
  }
}
