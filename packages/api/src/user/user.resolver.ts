import { UseGuards } from '@nestjs/common'
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'

import { AuthorizationGuard } from '../authentication/authorization.guard'
import { CurrentFirebaseUser } from '../authentication/current-firebase-user.decorator'
import { StrictThrottle } from '../common/throttling/strict-rate-limit.decorator'
import { StrictIdentityThrottlerGuard } from '../common/throttling/strict-identity-throttler.guard'
import { CurrentUser } from './decorators/current-user.decorator'
import { Roles } from './decorators/roles.decorator'
import { CreateOwnUserInput } from './dto/create-own-user.input'
import { UpdateOwnUserInput } from './dto/update-own-user.input'
import { RolesGuard } from './guards/roles.guard'
import { UserRole } from './user-role.enum'
import { User } from './user.entity'
import { UserService } from './user.service'

@Resolver(() => User)
export class UserResolver {
  constructor(private readonly userService: UserService) {}

  @Mutation(() => User, {
    description:
      'Creates the application user profile for the authenticated Firebase identity',
  })
  @UseGuards(AuthorizationGuard, StrictIdentityThrottlerGuard)
  @StrictThrottle()
  createOwnUser(
    @CurrentFirebaseUser() identity: { uid: string; email?: string },
    @Args('input') input: CreateOwnUserInput,
  ): Promise<User> {
    return this.userService.createOwnUser(identity, input)
  }

  @Query(() => User, {
    description:
      'Returns the MongoDB application user for the authenticated Firebase identity',
  })
  @UseGuards(AuthorizationGuard)
  currentUser(@CurrentFirebaseUser() identity: { uid: string }): Promise<User> {
    return this.userService.requireByFirebaseUid(identity.uid)
  }

  @Mutation(() => User, {
    description: 'Updates the authenticated user profile fields',
  })
  @UseGuards(AuthorizationGuard, RolesGuard, StrictIdentityThrottlerGuard)
  @StrictThrottle()
  updateOwnUser(
    @CurrentFirebaseUser() identity: { uid: string },
    @Args('input') input: UpdateOwnUserInput,
  ): Promise<User> {
    return this.userService.updateOwnUser(identity.uid, input)
  }

  @Query(() => String, {
    description: 'Phase 5 authorization proof endpoint for APOTHEKER',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.APOTHEKER)
  apothekerArea(@CurrentUser() user: User): string {
    return `Apotheker area accessible for ${user.firstName} ${user.lastName}`
  }

  @Query(() => String, {
    description: 'Phase 5 authorization proof endpoint for ADMIN',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminArea(@CurrentUser() user: User): string {
    return `Admin area accessible for ${user.firstName} ${user.lastName}`
  }

  @Query(() => String, {
    description: 'Phase 5 authorization proof endpoint for BEZORGER',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.BEZORGER)
  bezorgerArea(@CurrentUser() user: User): string {
    return `Bezorger area accessible for ${user.firstName} ${user.lastName}`
  }
}
