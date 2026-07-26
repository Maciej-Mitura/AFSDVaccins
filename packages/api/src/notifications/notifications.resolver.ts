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
import {
  MY_NOTIFICATIONS_DEFAULT_LIMIT,
  NotificationService,
} from './notification.service'

@Resolver(() => Notification)
export class NotificationsResolver {
  constructor(
    private readonly notificationService: NotificationService,
    @Inject(PUB_SUB) private readonly pubSub: PubSub,
  ) {}

  @Query(() => [Notification], {
    description:
      'Returns notifications for the authenticated user (newest first, bounded)',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.APOTHEKER, UserRole.ADMIN, UserRole.BEZORGER)
  myNotifications(
    @CurrentUser() user: User,
    @Args('unreadOnly', { type: () => Boolean, defaultValue: false })
    unreadOnly: boolean,
    @Args('limit', {
      type: () => Int,
      nullable: true,
      defaultValue: MY_NOTIFICATIONS_DEFAULT_LIMIT,
    })
    limit?: number,
  ): Promise<Notification[]> {
    return this.notificationService.findMyNotifications(
      user,
      unreadOnly,
      limit ?? MY_NOTIFICATIONS_DEFAULT_LIMIT,
    )
  }

  @Query(() => Int, {
    description: 'Returns unread notification count for the authenticated user',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.APOTHEKER, UserRole.ADMIN, UserRole.BEZORGER)
  myUnreadNotificationCount(@CurrentUser() user: User): Promise<number> {
    return this.notificationService.countUnread(user)
  }

  @Mutation(() => Notification, {
    description: 'Marks one owned notification as read (idempotent)',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.APOTHEKER, UserRole.ADMIN, UserRole.BEZORGER)
  markNotificationRead(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Notification> {
    return this.notificationService.markNotificationRead(user, id)
  }

  @Mutation(() => Int, {
    description:
      'Marks all owned notifications as read (idempotent); returns updated count',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.APOTHEKER, UserRole.ADMIN, UserRole.BEZORGER)
  markAllNotificationsRead(@CurrentUser() user: User): Promise<number> {
    return this.notificationService.markAllNotificationsRead(user)
  }

  @Subscription(() => Notification, {
    description:
      'Live notification events for the authenticated recipient only (no cross-user leakage)',
    filter: filterNotificationReceivedEvent,
    resolve: (payload: { notificationReceived: Notification }) =>
      payload.notificationReceived,
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.APOTHEKER, UserRole.ADMIN, UserRole.BEZORGER)
  notificationReceived() {
    return this.pubSub.asyncIterableIterator(NOTIFICATION_RECEIVED_EVENT)
  }
}
