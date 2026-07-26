import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { CLOCK, SystemClock } from '../order/clock.provider'
import { ProfileCoreModule } from '../profile/profile-core.module'
import { PushCoreModule } from '../push/push-core.module'
import { DeliveryRoute } from '../routes/delivery-route.entity'
import { UserCoreModule } from '../user/user-core.module'
import { BusinessNotificationProducerService } from './business-notification-producer.service'
import { NotificationsCoreModule } from './notifications-core.module'

const isSchemaGeneration =
  process.argv.includes('--generate-schema-only') ||
  process.env.GENERATE_SCHEMA_ONLY === 'true'

const businessProducerProvider = isSchemaGeneration
  ? {
      provide: BusinessNotificationProducerService,
      useValue: {
        notifyAdminsNewOrder: () => Promise.resolve(),
        notifyCourierRouteAssigned: () => Promise.resolve(),
        notifyPharmacyRouteStarted: () => Promise.resolve(),
        notifyNextPharmacy: () => Promise.resolve(),
        notifyPharmacyDeliveryConfirmed: () => Promise.resolve(),
        notifyCourierRouteDateReminder: () => Promise.resolve(),
        notifyCourierRouteDateRemindersForLocalDate: () => Promise.resolve(),
      },
    }
  : BusinessNotificationProducerService

const persistenceImports = isSchemaGeneration
  ? []
  : [TypeOrmModule.forFeature([DeliveryRoute])]

/**
 * Phase 27C business notification producers.
 * Imports PushCoreModule for delivery policy; does not create a cycle with
 * NotificationsCore (PushCore → NotificationsCore only).
 * Uses UserCoreModule / ProfileCoreModule (no GraphQL/throttler) so Seed/Bootstrap
 * CLI graphs stay HTTP-free.
 */
@Module({
  imports: [
    NotificationsCoreModule,
    PushCoreModule,
    UserCoreModule,
    ProfileCoreModule,
    ...persistenceImports,
  ],
  providers: [
    businessProducerProvider,
    {
      provide: CLOCK,
      useClass: SystemClock,
    },
  ],
  exports: [BusinessNotificationProducerService],
})
export class BusinessNotificationModule {}
