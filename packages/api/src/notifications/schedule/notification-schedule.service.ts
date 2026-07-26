import { Injectable, Logger, Inject } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'

import { DEFAULT_TIMEZONE } from '../../settings/settings.constants'
import { getZonedDateParts } from '../../order/delivery-date.util'
import { CLOCK } from '../../order/clock.provider'
import type { Clock } from '../../order/clock.provider'
import { BusinessNotificationProducerService } from '../business-notification-producer.service'

export {
  buildRouteDateReminderEventId,
  shouldSkipSameDayRouteDateReminder,
  ROUTE_DATE_REMINDER_HOUR_BRUSSELS,
  ROUTE_DATE_REMINDER_MINUTE_BRUSSELS,
} from './route-date-reminder.policy'

/**
 * Provider-neutral scheduled-notification job.
 * Cron is Europe/Brussels 08:00; generation is delegated to the producer.
 */
@Injectable()
export class NotificationScheduleService {
  private readonly logger = new Logger(NotificationScheduleService.name)

  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly businessNotificationProducer: BusinessNotificationProducerService,
  ) {}

  /**
   * Daily tick at 08:00 Europe/Brussels.
   * Generates BEZORGER_ROUTE_DATE_REMINDER for eligible routes.
   */
  @Cron('0 8 * * *', {
    timeZone: DEFAULT_TIMEZONE,
    name: 'bezorger-route-date-reminder-tick',
  })
  async handleRouteDateReminderTick(): Promise<void> {
    const now = this.clock.now()
    const parts = getZonedDateParts(now, DEFAULT_TIMEZONE)
    const localDate = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`

    this.logger.debug(
      `Route-date reminder tick local=${localDate} ${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')} ${DEFAULT_TIMEZONE}`,
    )

    await this.businessNotificationProducer.notifyCourierRouteDateRemindersForLocalDate(
      localDate,
    )
  }

  /** Test/helper: exposes timezone constant used by the cron. */
  getReminderTimezone(): string {
    return DEFAULT_TIMEZONE
  }
}
