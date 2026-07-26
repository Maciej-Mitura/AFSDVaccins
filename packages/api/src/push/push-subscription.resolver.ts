import { UseGuards } from '@nestjs/common'
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'

import { AuthorizationGuard } from '../authentication/authorization.guard'
import { CurrentUser } from '../user/decorators/current-user.decorator'
import { Roles } from '../user/decorators/roles.decorator'
import { RolesGuard } from '../user/guards/roles.guard'
import { User } from '../user/user.entity'
import { UserRole } from '../user/user-role.enum'
import {
  DisablePushSubscriptionInput,
  RegisterPushSubscriptionInput,
} from './dto/push-subscription.input'
import { PushCapabilityStatus } from './push-subscription.entity'
import { PushSubscriptionService } from './push-subscription.service'

@Resolver()
export class PushSubscriptionResolver {
  constructor(
    private readonly pushSubscriptionService: PushSubscriptionService,
  ) {}

  @Query(() => PushCapabilityStatus, {
    description:
      'Push capability/status for the authenticated user (no raw subscription secrets)',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.APOTHEKER, UserRole.ADMIN, UserRole.BEZORGER)
  myPushCapability(
    @CurrentUser() user: User,
  ): Promise<PushCapabilityStatus> {
    return this.pushSubscriptionService.getCapabilityStatus(user)
  }

  @Mutation(() => PushCapabilityStatus, {
    description:
      'Register or update a Web Push subscription for the authenticated user (idempotent)',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.APOTHEKER, UserRole.ADMIN, UserRole.BEZORGER)
  registerPushSubscription(
    @CurrentUser() user: User,
    @Args('input') input: RegisterPushSubscriptionInput,
  ): Promise<PushCapabilityStatus> {
    return this.pushSubscriptionService.registerSubscription(user, input)
  }

  @Mutation(() => PushCapabilityStatus, {
    description:
      'Disable one or all Web Push subscriptions for the authenticated user (idempotent)',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.APOTHEKER, UserRole.ADMIN, UserRole.BEZORGER)
  disablePushSubscription(
    @CurrentUser() user: User,
    @Args('input', { nullable: true, defaultValue: {} })
    input: DisablePushSubscriptionInput,
  ): Promise<PushCapabilityStatus> {
    return this.pushSubscriptionService.disableSubscription(user, input ?? {})
  }
}
