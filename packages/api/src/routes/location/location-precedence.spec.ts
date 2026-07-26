import { RouteLastKnownLocation } from './route-last-known-location.embed'
import { RouteLocationSource } from './route-location-source.enum'
import { decideLocationUpdatePrecedence } from './location-precedence'

function loc(
  overrides: Partial<RouteLastKnownLocation> &
    Pick<RouteLastKnownLocation, 'eventId' | 'recordedAt' | 'source' | 'stopId'>,
): RouteLastKnownLocation {
  return {
    stopSequence: 1,
    city: 'Gent',
    recordedByUserId: 'u',
    recordedByBezorgerProfileId: 'p',
    ...overrides,
  }
}

describe('decideLocationUpdatePrecedence', () => {
  it('accepts the first location', () => {
    expect(
      decideLocationUpdatePrecedence(
        null,
        loc({
          eventId: 'e1',
          recordedAt: new Date('2026-07-26T10:00:00.000Z'),
          source: RouteLocationSource.ARRIVAL,
          stopId: 's1',
        }),
      ),
    ).toBe('accept')
  })

  it('treats duplicate eventId as noop', () => {
    const current = loc({
      eventId: 'e1',
      recordedAt: new Date('2026-07-26T10:00:00.000Z'),
      source: RouteLocationSource.ARRIVAL,
      stopId: 's1',
    })
    expect(
      decideLocationUpdatePrecedence(
        current,
        loc({
          eventId: 'e1',
          recordedAt: new Date('2026-07-26T11:00:00.000Z'),
          source: RouteLocationSource.DELIVERY,
          stopId: 's1',
        }),
      ),
    ).toBe('noop_duplicate')
  })

  it('lets newer recordedAt win', () => {
    const current = loc({
      eventId: 'e1',
      recordedAt: new Date('2026-07-26T10:00:00.000Z'),
      source: RouteLocationSource.ARRIVAL,
      stopId: 's1',
    })
    expect(
      decideLocationUpdatePrecedence(
        current,
        loc({
          eventId: 'e2',
          recordedAt: new Date('2026-07-26T10:05:00.000Z'),
          source: RouteLocationSource.ARRIVAL,
          stopId: 's2',
        }),
      ),
    ).toBe('accept')
  })

  it('rejects older events', () => {
    const current = loc({
      eventId: 'e2',
      recordedAt: new Date('2026-07-26T10:05:00.000Z'),
      source: RouteLocationSource.DELIVERY,
      stopId: 's2',
    })
    expect(
      decideLocationUpdatePrecedence(
        current,
        loc({
          eventId: 'e1',
          recordedAt: new Date('2026-07-26T10:00:00.000Z'),
          source: RouteLocationSource.ARRIVAL,
          stopId: 's1',
        }),
      ),
    ).toBe('stale')
  })

  it('lets DELIVERY replace ARRIVAL on equal time same stop', () => {
    const at = new Date('2026-07-26T10:00:00.000Z')
    const current = loc({
      eventId: 'arrival-1',
      recordedAt: at,
      source: RouteLocationSource.ARRIVAL,
      stopId: 's1',
    })
    expect(
      decideLocationUpdatePrecedence(
        current,
        loc({
          eventId: 'delivery-1',
          recordedAt: at,
          source: RouteLocationSource.DELIVERY,
          stopId: 's1',
        }),
      ),
    ).toBe('accept')
  })

  it('does not let ARRIVAL replace DELIVERY on equal time same stop', () => {
    const at = new Date('2026-07-26T10:00:00.000Z')
    const current = loc({
      eventId: 'delivery-1',
      recordedAt: at,
      source: RouteLocationSource.DELIVERY,
      stopId: 's1',
    })
    expect(
      decideLocationUpdatePrecedence(
        current,
        loc({
          eventId: 'arrival-1',
          recordedAt: at,
          source: RouteLocationSource.ARRIVAL,
          stopId: 's1',
        }),
      ),
    ).toBe('stale')
  })
})
