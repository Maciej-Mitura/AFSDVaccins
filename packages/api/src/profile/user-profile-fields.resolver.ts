import { Parent, ResolveField, Resolver } from '@nestjs/graphql'

import { User } from '../user/user.entity'
import { UserRole } from '../user/user-role.enum'
import { ApothekerProfile } from './apotheker/apotheker-profile.entity'
import { ApothekerProfileService } from './apotheker/apotheker-profile.service'
import { BezorgerProfile } from './bezorger/bezorger-profile.entity'
import { BezorgerProfileService } from './bezorger/bezorger-profile.service'

@Resolver(() => User)
export class UserProfileFieldsResolver {
  constructor(
    private readonly apothekerProfileService: ApothekerProfileService,
    private readonly bezorgerProfileService: BezorgerProfileService,
  ) {}

  @ResolveField(() => ApothekerProfile, {
    nullable: true,
    description: 'Pharmacy profile when the user is an APOTHEKER',
  })
  apothekerProfile(
    @Parent() user: User,
  ): Promise<ApothekerProfile | null> {
    if (user.role !== UserRole.APOTHEKER) {
      return Promise.resolve(null)
    }

    return this.apothekerProfileService.findByUserId(user._id.toString())
  }

  @ResolveField(() => BezorgerProfile, {
    nullable: true,
    description: 'Courier profile when the user is a BEZORGER',
  })
  bezorgerProfile(@Parent() user: User): Promise<BezorgerProfile | null> {
    if (user.role !== UserRole.BEZORGER) {
      return Promise.resolve(null)
    }

    return this.bezorgerProfileService.findByUserId(user._id.toString())
  }
}
