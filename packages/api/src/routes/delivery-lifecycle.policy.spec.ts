import { DeliveryStop } from './delivery-stop.embed'
import { StopArrivalSource } from './arrival/stop-arrival-source.enum'
import { DeliveryProofMethod } from './qr/delivery-proof-method.enum'
import { RouteStatus } from './route-status.enum'
import {
  canCompleteRouteWithCurrentStops,
  countIncompleteDeliverableStops,
  deriveStopLifecycleStatus,
  evaluateRouteCompletionEligibility,
  isStopArrived,
  isStopDeliveryConfirmed,
  listIncompleteDeliverableStops,
  stopRequiresDeliveryConfirmation,
} from './delivery-lifecycle.policy'

function confirmedProof(
  overrides: Partial<NonNullable<DeliveryStop['deliveryProof']>> = {},
): NonNullable<DeliveryStop['deliveryProof']> {
  return {
    method: DeliveryProofMethod.QR,
    deliveredAt: new Date('2026-07-29T10:05:00.000Z'),
    deliveredByUserId: 'courier-1',
    associatedOrderIds: ['order-1'],
    recipientProfileId: 'ap-1',
    recipientCity: 'Gent',
    ...overrides,
  }
}

function makeStop(
  overrides: Partial<DeliveryStop> & { sequence: number },
): DeliveryStop {
  return {
    sequence: overrides.sequence,
    apothekerProfileId: overrides.apothekerProfileId ?? 'ap-1',
    apothekerUserId: overrides.apothekerUserId ?? 'user-1',
    pharmacyName: overrides.pharmacyName ?? 'Pharmacy',
    address: overrides.address ?? {
      street: 'Street',
      houseNumber: '1',
      postalCode: '9000',
      city: 'Gent',
      country: 'BE',
    },
    orderIds: overrides.orderIds ?? ['order-1'],
    orderCount: overrides.orderCount ?? 1,
    totalQuantity: overrides.totalQuantity ?? 2,
    lines: overrides.lines ?? [],
    stopId: overrides.stopId ?? `stop-${overrides.sequence}`,
    arrival: overrides.arrival,
    deliveryProof: overrides.deliveryProof,
    qrConfirmation: overrides.qrConfirmation,
  }
}

describe('delivery-lifecycle.policy', () => {
  describe('decision table / derived stop status', () => {
    it('pending: no arrival, no proof → pending; order stays non-delivered conceptually', () => {
      const stop = makeStop({ sequence: 1 })
      expect(deriveStopLifecycleStatus(stop)).toBe('pending')
      expect(isStopArrived(stop)).toBe(false)
      expect(isStopDeliveryConfirmed(stop)).toBe(false)
    })

    it('mark arrived leaves delivery unconfirmed (order remains PLANNED in domain)', () => {
      const stop = makeStop({
        sequence: 1,
        arrival: {
          clientArrivedAt: new Date('2026-07-29T10:00:00.000Z'),
          recordedAt: new Date('2026-07-29T10:00:01.000Z'),
          arrivedByUserId: 'courier-1',
          arrivedByBezorgerProfileId: 'bez-1',
          source: StopArrivalSource.COURIER,
          idempotencyKey: 'idem-1',
        },
      })
      expect(deriveStopLifecycleStatus(stop)).toBe('arrived')
      expect(isStopDeliveryConfirmed(stop)).toBe(false)
    })

    it('QR/proof confirmation yields delivery_confirmed', () => {
      const stop = makeStop({
        sequence: 1,
        deliveryProof: confirmedProof(),
      })
      expect(deriveStopLifecycleStatus(stop)).toBe('delivery_confirmed')
      expect(isStopDeliveryConfirmed(stop)).toBe(true)
    })

    it('consumed QR without separate proof still counts as confirmed', () => {
      const stop = makeStop({
        sequence: 1,
        qrConfirmation: {
          tokenVersion: 1,
          nonceHash: 'a'.repeat(64),
          encodedToken: 'cleared',
          issuedAt: new Date('2026-07-29T09:00:00.000Z'),
          consumedAt: new Date('2026-07-29T10:05:00.000Z'),
          consumedByUserId: 'courier-1',
        },
      })
      expect(isStopDeliveryConfirmed(stop)).toBe(true)
      expect(deriveStopLifecycleStatus(stop)).toBe('delivery_confirmed')
    })
  })

  describe('stopRequiresDeliveryConfirmation', () => {
    it('requires confirmation when orderIds or orderCount present', () => {
      expect(
        stopRequiresDeliveryConfirmation(
          makeStop({ sequence: 1, orderIds: ['a'], orderCount: 0 }),
        ),
      ).toBe(true)
      expect(
        stopRequiresDeliveryConfirmation(
          makeStop({ sequence: 1, orderIds: [], orderCount: 2 }),
        ),
      ).toBe(true)
    })

    it('empty stops do not require confirmation', () => {
      expect(
        stopRequiresDeliveryConfirmation(
          makeStop({ sequence: 1, orderIds: [], orderCount: 0 }),
        ),
      ).toBe(false)
    })
  })

  describe('route completion eligibility', () => {
    it('allows zero-stop routes', () => {
      const result = evaluateRouteCompletionEligibility([])
      expect(result.ok).toBe(true)
      expect(result.incompleteStopCount).toBe(0)
    })

    it('allows routes whose only stops have no orders', () => {
      const result = evaluateRouteCompletionEligibility([
        makeStop({ sequence: 1, orderIds: [], orderCount: 0 }),
      ])
      expect(result.ok).toBe(true)
    })

    it('blocks when a deliverable stop lacks confirmation', () => {
      const incomplete = makeStop({ sequence: 1 })
      const result = evaluateRouteCompletionEligibility([incomplete])
      expect(result.ok).toBe(false)
      expect(result.incompleteStopCount).toBe(1)
      expect(result.incompleteStops[0]).toBe(incomplete)
    })

    it('allows when every deliverable stop is confirmed', () => {
      const result = evaluateRouteCompletionEligibility([
        makeStop({
          sequence: 1,
          deliveryProof: confirmedProof(),
        }),
        makeStop({ sequence: 2, orderIds: [], orderCount: 0 }),
      ])
      expect(result.ok).toBe(true)
      expect(countIncompleteDeliverableStops(result.incompleteStops)).toBe(0)
    })

    it('counts only incomplete deliverable stops', () => {
      const stops = [
        makeStop({ sequence: 1 }),
        makeStop({
          sequence: 2,
          deliveryProof: confirmedProof(),
        }),
        makeStop({ sequence: 3, orderIds: [], orderCount: 0 }),
      ]
      expect(listIncompleteDeliverableStops(stops)).toHaveLength(1)
      expect(countIncompleteDeliverableStops(stops)).toBe(1)
    })

    it('canCompleteRouteWithCurrentStops defers FSM but still reports incompletes', () => {
      const stops = [makeStop({ sequence: 1 })]
      const assigned = canCompleteRouteWithCurrentStops(
        RouteStatus.ASSIGNED,
        stops,
      )
      expect(assigned.ok).toBe(false)
      expect(assigned.incompleteStopCount).toBe(1)

      const inProgressOk = canCompleteRouteWithCurrentStops(
        RouteStatus.IN_PROGRESS,
        [
          makeStop({
            sequence: 1,
            deliveryProof: confirmedProof(),
          }),
        ],
      )
      expect(inProgressOk.ok).toBe(true)
    })
  })
})
