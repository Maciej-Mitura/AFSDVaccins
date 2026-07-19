import {
  isAtOrAfterClosingTime,
  resolveDeliveryDate,
} from '../order/delivery-date.util'
import {
  filterOrdersForTomorrowPreview,
  isOrderEligibleForTomorrowPreview,
} from './route-preview-eligibility.util'

const TIMEZONE = 'Europe/Brussels'
const CLOSING = '14:00'

describe('route-preview-eligibility.util', () => {
  it('includes submission one minute before closing', () => {
    const submittedAt = new Date('2026-07-15T11:59:00.000Z')

    expect(isAtOrAfterClosingTime(submittedAt, TIMEZONE, CLOSING)).toBe(false)
    expect(
      isOrderEligibleForTomorrowPreview({ submittedAt }, TIMEZONE, CLOSING),
    ).toBe(true)
  })

  it('excludes submission exactly at closing', () => {
    const submittedAt = new Date('2026-07-15T12:00:00.000Z')

    expect(isAtOrAfterClosingTime(submittedAt, TIMEZONE, CLOSING)).toBe(true)
    expect(
      isOrderEligibleForTomorrowPreview({ submittedAt }, TIMEZONE, CLOSING),
    ).toBe(false)
    expect(resolveDeliveryDate(submittedAt, TIMEZONE, CLOSING)).toBe(
      '2026-07-16',
    )
  })

  it('excludes submission after closing', () => {
    const submittedAt = new Date('2026-07-15T12:01:00.000Z')

    expect(
      isOrderEligibleForTomorrowPreview({ submittedAt }, TIMEZONE, CLOSING),
    ).toBe(false)
  })

  it('filters a mixed list keeping only pre-closing submissions', () => {
    const before = {
      id: 'a',
      submittedAt: new Date('2026-07-15T11:59:00.000Z'),
    }
    const atClosing = {
      id: 'b',
      submittedAt: new Date('2026-07-15T12:00:00.000Z'),
    }
    const after = {
      id: 'c',
      submittedAt: new Date('2026-07-15T21:00:00.000Z'),
    }

    const kept = filterOrdersForTomorrowPreview(
      [before, atClosing, after] as never,
      TIMEZONE,
      CLOSING,
    )

    expect(kept.map(order => order.id)).toEqual(['a'])
  })

  it('respects a non-default configured closing time', () => {
    const submittedAt = new Date('2026-07-15T13:00:00.000Z') // 15:00 Brussels

    expect(
      isOrderEligibleForTomorrowPreview({ submittedAt }, TIMEZONE, '15:30'),
    ).toBe(true)
    expect(
      isOrderEligibleForTomorrowPreview({ submittedAt }, TIMEZONE, '14:00'),
    ).toBe(false)
  })
})
