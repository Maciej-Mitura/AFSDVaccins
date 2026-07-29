import { describe, expect, it } from 'vitest'

import {
  deriveStopLifecycleStatus,
  evaluateRouteCompletionEligibility,
  isStopDeliveryConfirmed,
  listIncompleteDeliverableStops,
  stopRequiresDeliveryConfirmation,
} from './delivery-stop-lifecycle'

describe('delivery-stop-lifecycle', () => {
  it('derives pending → arrived → delivery_confirmed', () => {
    expect(deriveStopLifecycleStatus({ orderIds: ['a'], orderCount: 1 })).toBe(
      'pending',
    )
    expect(
      deriveStopLifecycleStatus({
        orderIds: ['a'],
        orderCount: 1,
        arrival: { recordedAt: '2026-07-29T10:00:00.000Z' },
      }),
    ).toBe('arrived')
    expect(
      deriveStopLifecycleStatus({
        orderIds: ['a'],
        orderCount: 1,
        arrival: { recordedAt: '2026-07-29T10:00:00.000Z' },
        deliveredAt: '2026-07-29T10:05:00.000Z',
      }),
    ).toBe('delivery_confirmed')
    expect(
      deriveStopLifecycleStatus({
        orderIds: ['a'],
        orderCount: 1,
        qrConsumed: true,
      }),
    ).toBe('delivery_confirmed')
  })

  it('arrival alone is not delivery confirmed', () => {
    expect(
      isStopDeliveryConfirmed({
        orderIds: ['a'],
        arrival: { clientArrivedAt: '2026-07-29T10:00:00.000Z' },
      }),
    ).toBe(false)
  })

  it('blocks completion for incomplete deliverable stops only', () => {
    const stops = [
      { orderIds: ['a'], orderCount: 1, pharmacyName: 'A' },
      {
        orderIds: ['b'],
        orderCount: 1,
        pharmacyName: 'B',
        deliveredAt: '2026-07-29T10:05:00.000Z',
      },
      { orderIds: [], orderCount: 0, pharmacyName: 'Empty' },
    ]
    expect(listIncompleteDeliverableStops(stops)).toHaveLength(1)
    expect(evaluateRouteCompletionEligibility(stops)).toEqual({
      ok: false,
      incompleteStopCount: 1,
    })
    expect(stopRequiresDeliveryConfirmation({ orderIds: [], orderCount: 0 })).toBe(
      false,
    )
    expect(evaluateRouteCompletionEligibility([])).toEqual({
      ok: true,
      incompleteStopCount: 0,
    })
  })
})
