import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { PubSubModule } from '../common/pubsub/pubsub.module'
import { CLOCK, SystemClock } from '../order/clock.provider'
import { NotificationEventsService } from './notification-events.service'
import { Notification } from './notification.entity'
import { NotificationService } from './notification.service'
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
  imports: [PubSubModule, ...persistenceImports],
  providers: [
    notificationServiceProvider,
    orderNotificationServiceProvider,
    NotificationEventsService,
    {
      provide: CLOCK,
      useClass: SystemClock,
    },
  ],
  exports: [
    NotificationService,
    OrderNotificationService,
    ...persistenceImports,
  ],
})
export class NotificationsCoreModule {}
