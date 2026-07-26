import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'

import { CLOCK, SystemClock } from '../../order/clock.provider'
import { BusinessNotificationModule } from '../business-notification.module'
import { NotificationScheduleService } from './notification-schedule.service'

const isSchemaGeneration =
  process.argv.includes('--generate-schema-only') ||
  process.env.GENERATE_SCHEMA_ONLY === 'true'

/**
 * Nest Schedule init for route-date reminders.
 * Cron is skipped in test/schema-generation so e2e teardown is not blocked by
 * scheduler timers. No high-frequency polling.
 */
const scheduleImports =
  isSchemaGeneration || process.env.NODE_ENV === 'test'
    ? []
    : [ScheduleModule.forRoot()]

@Module({
  imports: [...scheduleImports, BusinessNotificationModule],
  providers: [
    NotificationScheduleService,
    {
      provide: CLOCK,
      useClass: SystemClock,
    },
  ],
  exports: [NotificationScheduleService],
})
export class NotificationScheduleModule {}
