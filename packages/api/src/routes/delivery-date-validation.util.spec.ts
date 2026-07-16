import { isValidDeliveryDateString } from './delivery-date-validation.util'

describe('isValidDeliveryDateString', () => {
  it('accepts YYYY-MM-DD calendar dates', () => {
    expect(isValidDeliveryDateString('2026-07-16')).toBe(true)
  })

  it('rejects invalid formats and impossible days', () => {
    expect(isValidDeliveryDateString('16-07-2026')).toBe(false)
    expect(isValidDeliveryDateString('2026-13-01')).toBe(false)
    expect(isValidDeliveryDateString('2026-02-30')).toBe(false)
  })
})
