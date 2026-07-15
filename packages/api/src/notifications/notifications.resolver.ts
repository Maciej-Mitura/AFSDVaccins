import { Inject, UseGuards } from '@nestjs/common'
import {
  Args,
  ID,
  Int,
  Mutation,
  Query,
  Resolver,
  Subscription,
} from '@nestjs/graphql'
import { PubSub } from 'graphql-subscriptions'

import { AuthorizationGuard } from '../authentication/authorization.guard'
import {
  NOTIFICATION_RECEIVED_EVENT,
  PUB_SUB,
} from '../common/pubsub/pubsub.constants'
import { CurrentUser } from '../user/decorators/current-user.decorator'
import { Roles } from '../user/decorators/roles.decorator'
import { RolesGuard } from '../user/guards/roles.guard'
import { User } from '../user/user.entity'
import { UserRole } from '../user/user-role.enum'
import { Notification } from './notification.entity'
import { filterNotificationReceivedEvent } from './notification-subscription.filter'
import { NotificationService } from './notification.service'

@Resolver(() => Notification)
export class NotificationsResolver {
  constructor(
    private readonly notificationService: NotificationService,
    @Inject(PUB_SUB) private readonly pubSub: PubSub,
  ) {}

  @Query(() => [Notification], {
    description:
      'Returns notifications for the authenticated apotheker or admin user',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.APOTHEKER, UserRole.ADMIN)
  myNotifications(
    @CurrentUser() user: User,
    @Args('unreadOnly', { type: () => Boolean, defaultValue: false })
    unreadOnly: boolean,
  ): Promise<Notification[]> {
    return this.notificationService.findMyNotifications(user, unreadOnly)
  }

  @Query(() => Int, {
    description:
      'Returns unread notification count for the authenticated apotheker or admin user',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.APOTHEKER, UserRole.ADMIN)
  myUnreadNotificationCount(@CurrentUser() user: User): Promise<number> {
    return this.notificationService.countUnread(user)
  }

  @Mutation(() => Notification, {
    description: 'Marks one owned notification as read',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.APOTHEKER, UserRole.ADMIN)
  markNotificationRead(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Notification> {
    return this.notificationService.markNotificationRead(user, id)
  }

  @Subscription(() => Notification, {
    description:
      'Live notification events for the authenticated apotheker or admin user',
    filter: filterNotificationReceivedEvent,
    resolve: (payload: { notificationReceived: Notification }) =>
      payload.notificationReceived,
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.APOTHEKER, UserRole.ADMIN)
  notificationReceived() {
    return this.pubSub.asyncIterableIterator(NOTIFICATION_RECEIVED_EVENT)
  }
}
