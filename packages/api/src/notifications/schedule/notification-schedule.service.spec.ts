import { DEFAULT_TIMEZONE } from '../../settings/settings.constants'
import {
  buildRouteDateReminderEventId,
  NotificationScheduleService,
  shouldSkipSameDayRouteDateReminder,
} from './notification-schedule.service'

describe('NotificationScheduleService foundation', () => {
  it('uses Europe/Brussels timezone', () => {
    const service = new NotificationScheduleService({
      now: () => new Date('2026-07-26T06:00:00.000Z'),
    })
    expect(service.getReminderTimezone()).toBe(DEFAULT_TIMEZONE)
    expect(DEFAULT_TIMEZONE).toBe('Europe/Brussels')
  })

  it('builds idempotent scheduled event IDs', () => {
    const a = buildRouteDateReminderEventId('user-1', 'route-9', '2026-07-26')
    const b = buildRouteDateReminderEventId('user-1', 'route-9', '2026-07-26')
    expect(a).toBe(b)
    expect(a).toContain('2026-07-26')
  })

  it('skips redundant same-day reminder after 08:00 Brussels assignment', () => {
    // 2026-07-26 10:00 Europe/Brussels = 08:00 UTC (CEST +2)
    const assignedAt = new Date('2026-07-26T08:00:00.000Z')
    expect(
      shouldSkipSameDayRouteDateReminder(assignedAt, '2026-07-26'),
    ).toBe(true)

    // Before 08:00 Brussels — 05:30 UTC = 07:30 Brussels
    const early = new Date('2026-07-26T05:30:00.000Z')
    expect(shouldSkipSameDayRouteDateReminder(early, '2026-07-26')).toBe(false)

    // Different calendar date — never skip for that reason alone
    expect(
      shouldSkipSameDayRouteDateReminder(assignedAt, '2026-07-27'),
    ).toBe(false)
  })

  it('tick is foundation-only (no throw)', () => {
    const service = new NotificationScheduleService({
      now: () => new Date('2026-07-26T06:00:00.000Z'),
    })
    expect(() => service.handleRouteDateReminderTick()).not.toThrow()
  })
})
