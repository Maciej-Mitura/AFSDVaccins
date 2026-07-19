import {
  getIsoWeekYearForDeliveryDate,
  getLocalCalendarDate,
  getLocalTomorrowDate,
  getZonedDateParts,
  isAtOrAfterClosingTime,
  resolveDeliveryDate,
} from './delivery-date.util'

const TIMEZONE = 'Europe/Brussels'
const CLOSING = '14:00'

describe('delivery-date.util', () => {
  it('resolves same-day delivery one minute before closing', () => {
    const instant = new Date('2026-07-14T11:59:00.000Z')

    expect(resolveDeliveryDate(instant, TIMEZONE, CLOSING)).toBe('2026-07-14')
    expect(isAtOrAfterClosingTime(instant, TIMEZONE, CLOSING)).toBe(false)
  })

  it('resolves next-day delivery exactly at closing', () => {
    const instant = new Date('2026-07-14T12:00:00.000Z')

    expect(getZonedDateParts(instant, TIMEZONE)).toEqual(
      expect.objectContaining({ hour: 14, minute: 0 }),
    )
    expect(isAtOrAfterClosingTime(instant, TIMEZONE, CLOSING)).toBe(true)
    expect(resolveDeliveryDate(instant, TIMEZONE, CLOSING)).toBe('2026-07-15')
  })

  it('resolves next-day delivery one minute after closing', () => {
    const instant = new Date('2026-07-14T12:01:00.000Z')

    expect(resolveDeliveryDate(instant, TIMEZONE, CLOSING)).toBe('2026-07-15')
    expect(isAtOrAfterClosingTime(instant, TIMEZONE, CLOSING)).toBe(true)
  })

  it('handles Brussels winter offset before closing', () => {
    const instant = new Date('2026-01-14T12:59:00.000Z')

    expect(getZonedDateParts(instant, TIMEZONE)).toEqual(
      expect.objectContaining({ hour: 13, minute: 59 }),
    )
    expect(resolveDeliveryDate(instant, TIMEZONE, CLOSING)).toBe('2026-01-14')
  })

  it('handles Brussels summer offset after closing', () => {
    const instant = new Date('2026-07-14T12:30:00.000Z')

    expect(getZonedDateParts(instant, TIMEZONE)).toEqual(
      expect.objectContaining({ hour: 14, minute: 30 }),
    )
    expect(resolveDeliveryDate(instant, TIMEZONE, CLOSING)).toBe('2026-07-15')
  })

  it('handles local date boundary around midnight Brussels time', () => {
    const instant = new Date('2026-07-14T21:30:00.000Z')

    expect(getZonedDateParts(instant, TIMEZONE)).toEqual(
      expect.objectContaining({ day: 14, hour: 23, minute: 30 }),
    )
    expect(resolveDeliveryDate(instant, TIMEZONE, CLOSING)).toBe('2026-07-15')
  })

  it('derives ISO week/year from delivery date at year boundary', () => {
    expect(getIsoWeekYearForDeliveryDate('2025-12-31')).toEqual({
      isoWeek: 1,
      isoYear: 2026,
    })
  })

  it('computes local calendar and tomorrow dates in Europe/Brussels', () => {
    const instant = new Date('2026-07-15T12:00:00.000Z')

    expect(getLocalCalendarDate(instant, TIMEZONE)).toBe('2026-07-15')
    expect(getLocalTomorrowDate(instant, TIMEZONE)).toBe('2026-07-16')
  })

  it('computes tomorrow across month and year boundaries', () => {
    expect(
      getLocalTomorrowDate(new Date('2026-07-31T12:00:00.000Z'), TIMEZONE),
    ).toBe('2026-08-01')
    expect(
      getLocalTomorrowDate(new Date('2025-12-31T12:00:00.000Z'), TIMEZONE),
    ).toBe('2026-01-01')
  })
})
