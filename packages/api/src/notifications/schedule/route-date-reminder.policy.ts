import { DEFAULT_TIMEZONE } from '../../settings/settings.constants'
import { getZonedDateParts } from '../../order/delivery-date.util'

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
 * should skip the redundant route-date reminder.
 *
 * DST: comparisons use Europe/Brussels zoned parts from `assignedAt`, not
 * server-local time. Nest cron `timeZone: Europe/Brussels` likewise fires at
 * civil 08:00 on both sides of DST transitions.
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
