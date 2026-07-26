import { Injectable, Logger, Inject } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'

import { DEFAULT_TIMEZONE } from '../../settings/settings.constants'
import { getZonedDateParts } from '../../order/delivery-date.util'
import { CLOCK } from '../../order/clock.provider'
import type { Clock } from '../../order/clock.provider'

export const ROUTE_DATE_REMINDER_HOUR_BRUSSELS = 8
export const ROUTE_DATE_REMINDER_MINUTE_BRUSSELS = 0

/**
 * Builds an idempotent event id for the courier route-date reminder.
 * Safe across restarts: same recipient + route + calendar date → same id.
 */
export function buildRouteDateReminderEventId(
  recipientUserId: string,
  routeId: string,
  routeDate: string,
): string {
  return `bezorger-route-date-reminder:${recipientUserId}:${routeId}:${routeDate}`
}

/**
 * True when a same-day assignment after the 08:00 Brussels reminder window
 * should skip the redundant route-date reminder (wired in Phase 27C).
 */
export function shouldSkipSameDayRouteDateReminder(
  assignedAt: Date,
  routeDate: string,
  timeZone: string = DEFAULT_TIMEZONE,
): boolean {
  const parts = getZonedDateParts(assignedAt, timeZone)
  const localDate = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`

  if (localDate !== routeDate) {
    return false
  }

  if (parts.hour > ROUTE_DATE_REMINDER_HOUR_BRUSSELS) {
    return true
  }

  if (
    parts.hour === ROUTE_DATE_REMINDER_HOUR_BRUSSELS &&
    parts.minute >= ROUTE_DATE_REMINDER_MINUTE_BRUSSELS
  ) {
    return true
  }

  return false
}

/**
 * Provider-neutral scheduled-notification job foundation.
 * Cron is Europe/Brussels 08:00. Does not yet generate route reminders.
 */
@Injectable()
export class NotificationScheduleService {
  private readonly logger = new Logger(NotificationScheduleService.name)

  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  /**
   * Daily tick at 08:00 Europe/Brussels.
   * Phase 27A: logs only — route reminder generation is Phase 27C.
   */
  @Cron('0 8 * * *', {
    timeZone: DEFAULT_TIMEZONE,
    name: 'bezorger-route-date-reminder-tick',
  })
  handleRouteDateReminderTick(): void {
    const now = this.clock.now()
    const parts = getZonedDateParts(now, DEFAULT_TIMEZONE)

    this.logger.debug(
      `Route-date reminder tick (foundation only) local=${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')} ${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')} ${DEFAULT_TIMEZONE}`,
    )
  }

  /** Test/helper: exposes timezone constant used by the cron. */
  getReminderTimezone(): string {
    return DEFAULT_TIMEZONE
  }
}
