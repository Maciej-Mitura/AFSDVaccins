import {
  brusselsRouteDateStartUtc,
  parseClientArrivedAt,
  parseIdempotencyKey,
} from './delivery-stop-arrival-validation.util'
import {
  DeliveryArrivalIdempotencyKeyInvalidException,
  DeliveryArrivalTimestampInvalidException,
} from './delivery-stop-arrival.exceptions'

describe('delivery-stop-arrival-validation', () => {
  describe('brusselsRouteDateStartUtc', () => {
    it('returns a Date for a valid YYYY-MM-DD route date', () => {
      const start = brusselsRouteDateStartUtc('2026-07-26')
      expect(start).toBeInstanceOf(Date)
      expect(start!.toISOString()).toContain('2026-07-2')
    })

    it('returns null for invalid shapes', () => {
      expect(brusselsRouteDateStartUtc('26-07-2026')).toBeNull()
      expect(brusselsRouteDateStartUtc('')).toBeNull()
    })
  })

  describe('parseClientArrivedAt', () => {
    const now = new Date('2026-07-26T12:00:00.000Z')

    it('accepts a reasonable ISO timestamp on the route date', () => {
      const parsed = parseClientArrivedAt('2026-07-26T10:30:00.000Z', {
        routeDate: '2026-07-26',
        now,
      })
      expect(parsed.toISOString()).toBe('2026-07-26T10:30:00.000Z')
    })

    it('rejects more than 5 minutes in the future', () => {
      expect(() =>
        parseClientArrivedAt('2026-07-26T12:10:00.000Z', {
          routeDate: '2026-07-26',
          now,
        }),
      ).toThrow(DeliveryArrivalTimestampInvalidException)
    })

    it('rejects timestamps earlier than 24h before route date start', () => {
      expect(() =>
        parseClientArrivedAt('2026-07-24T10:00:00.000Z', {
          routeDate: '2026-07-26',
          now,
        }),
      ).toThrow(DeliveryArrivalTimestampInvalidException)
    })

    it('rejects non-string / empty / malformed values', () => {
      expect(() =>
        parseClientArrivedAt(null, { routeDate: '2026-07-26', now }),
      ).toThrow(DeliveryArrivalTimestampInvalidException)
      expect(() =>
        parseClientArrivedAt('not-a-date', { routeDate: '2026-07-26', now }),
      ).toThrow(DeliveryArrivalTimestampInvalidException)
    })
  })

  describe('parseIdempotencyKey', () => {
    it('accepts a bounded UUID-like key', () => {
      expect(parseIdempotencyKey('abcd-1234-efgh-5678')).toBe(
        'abcd-1234-efgh-5678',
      )
    })

    it('rejects short or illegal keys', () => {
      expect(() => parseIdempotencyKey('short')).toThrow(
        DeliveryArrivalIdempotencyKeyInvalidException,
      )
      expect(() => parseIdempotencyKey('has space!!!!')).toThrow(
        DeliveryArrivalIdempotencyKeyInvalidException,
      )
    })
  })
})
