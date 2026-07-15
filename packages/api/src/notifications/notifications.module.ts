import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AuthenticationModule } from '../authentication/authentication.module'
import { CLOCK, SystemClock } from '../order/clock.provider'
import { UserModule } from '../user/user.module'
import { NotificationEventsService } from './notification-events.service'
import { Notification } from './notification.entity'
import { NotificationService } from './notification.service'
import { NotificationsResolver } from './notifications.resolver'
import { OrderNotificationService } from './order-notification.service'

const isSchemaGeneration =
  process.argv.includes('--generate-schema-only') ||
  process.env.GENERATE_SCHEMA_ONLY === 'true'

const notificationServiceProvider = isSchemaGeneration
  ? {
      provide: NotificationService,
      useValue: {
        createNotification: () => Promise.resolve(null),
        findMyNotifications: () => Promise.resolve([]),
        countUnread: () => Promise.resolve(0),
        markNotificationRead: () => Promise.resolve(null),
      },
    }
  : NotificationService

const orderNotificationServiceProvider = isSchemaGeneration
  ? {
      provide: OrderNotificationService,
      useValue: {
        handleOrderCreated: () => Promise.resolve(undefined),
        createOrderCancelledNotification: () => Promise.resolve(undefined),
      },
    }
  : OrderNotificationService

const persistenceImports = isSchemaGeneration
  ? []
  : [TypeOrmModule.forFeature([Notification])]

@Module({
  imports: [AuthenticationModule, UserModule, ...persistenceImports],
  providers: [
    notificationServiceProvider,
    orderNotificationServiceProvider,
    NotificationEventsService,
    NotificationsResolver,
    {
      provide: CLOCK,
      useClass: SystemClock,
    },
  ],
  exports: [NotificationService, OrderNotificationService],
})
export class NotificationsModule {}
