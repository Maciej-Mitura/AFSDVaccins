import {
  getIsoWeekYear,
  getZonedDateParts,
  isAfterClosingTime,
  resolveDeliveryDate,
} from './ordering-time.util'

const TIMEZONE = 'Europe/Brussels'

describe('ordering-time.util', () => {
  it('resolves same-day delivery before closing time', () => {
    const instant = new Date('2026-07-14T10:00:00.000Z')

    expect(resolveDeliveryDate(instant, TIMEZONE, '14:00')).toBe('2026-07-14')
    expect(isAfterClosingTime(instant, TIMEZONE, '14:00')).toBe(false)
  })

  it('resolves next-day delivery after closing time', () => {
    const instant = new Date('2026-07-14T13:30:00.000Z')

    expect(resolveDeliveryDate(instant, TIMEZONE, '14:00')).toBe('2026-07-15')
    expect(isAfterClosingTime(instant, TIMEZONE, '14:00')).toBe(true)
  })

  it('treats exactly closing time as still open', () => {
    const instant = new Date('2026-07-14T12:00:00.000Z')

    expect(isAfterClosingTime(instant, TIMEZONE, '14:00')).toBe(false)
    expect(getZonedDateParts(instant, TIMEZONE)).toEqual(
      expect.objectContaining({ hour: 14, minute: 0 }),
    )
  })

  it('calculates ISO week for a normal week', () => {
    const instant = new Date('2026-07-15T10:00:00.000Z')

    expect(getIsoWeekYear(instant, TIMEZONE)).toEqual({
      isoWeek: 29,
      isoYear: 2026,
    })
  })

  it('handles Monday boundary in Brussels timezone', () => {
    const instant = new Date('2026-07-13T08:00:00.000Z')

    expect(getIsoWeekYear(instant, TIMEZONE)).toEqual({
      isoWeek: 29,
      isoYear: 2026,
    })
  })

  it('handles Sunday boundary in Brussels timezone', () => {
    const instant = new Date('2026-07-19T10:00:00.000Z')

    expect(getIsoWeekYear(instant, TIMEZONE)).toEqual({
      isoWeek: 29,
      isoYear: 2026,
    })
  })

  it('handles year transition around New Year', () => {
    const instant = new Date('2025-12-31T12:00:00.000Z')

    expect(getIsoWeekYear(instant, TIMEZONE)).toEqual({
      isoWeek: 1,
      isoYear: 2026,
    })
  })

  it('handles daylight-saving spring forward in Brussels', () => {
    const instant = new Date('2026-03-29T11:30:00.000Z')

    expect(getZonedDateParts(instant, TIMEZONE)).toEqual(
      expect.objectContaining({ hour: 13, minute: 30 }),
    )
    expect(resolveDeliveryDate(instant, TIMEZONE, '14:00')).toBe('2026-03-29')
  })
})
