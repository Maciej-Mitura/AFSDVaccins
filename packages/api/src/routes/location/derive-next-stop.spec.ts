import { DeliveryStop } from '../delivery-stop.embed'
import {
  areStopSequencesValid,
  deriveNextStop,
  isStopDelivered,
  selectNextUndeliveredStop,
} from './derive-next-stop'

function makeStop(
  overrides: Partial<DeliveryStop> & { sequence: number; stopId: string },
): DeliveryStop {
  return {
    apothekerProfileId: 'profile-1',
    apothekerUserId: 'user-1',
    pharmacyName: 'Apotheek',
    address: {
      street: 'S',
      houseNumber: '1',
      postalCode: '9000',
      city: 'Gent',
      country: 'BE',
    },
    orderIds: ['o1'],
    orderCount: 1,
    totalQuantity: 10,
    lines: [],
    deliveryProof: null,
    qrConfirmation: {
      nonceHash: 'h',
      encodedToken: 't',
      consumedAt: null,
      consumedByUserId: null,
    },
    ...overrides,
  } as DeliveryStop
}

describe('deriveNextStop (Phase 30A)', () => {
  it('selects the first later undelivered stop', () => {
    const completed = makeStop({ sequence: 1, stopId: 's1' })
    const next = makeStop({ sequence: 2, stopId: 's2', pharmacyName: 'B' })
    const later = makeStop({ sequence: 3, stopId: 's3' })

    const result = deriveNextStop([later, next, completed], completed)
    expect(result).toEqual({ ok: true, stop: next })
  })

  it('skips a delivered later stop', () => {
    const completed = makeStop({ sequence: 1, stopId: 's1' })
    const deliveredNext = makeStop({
      sequence: 2,
      stopId: 's2',
      deliveryProof: {
        method: 'QR' as never,
        deliveredAt: new Date(),
        deliveredByUserId: 'c',
        associatedOrderIds: ['o'],
        recipientProfileId: 'p',
        recipientCity: 'Kortrijk',
        confirmationEventId: 'e',
      },
    })
    const later = makeStop({ sequence: 3, stopId: 's3' })

    expect(
      deriveNextStop([completed, deliveredNext, later], completed),
    ).toEqual({ ok: true, stop: later })
  })

  it('skips a consumed later stop', () => {
    const completed = makeStop({ sequence: 1, stopId: 's1' })
    const consumed = makeStop({
      sequence: 2,
      stopId: 's2',
      qrConfirmation: {
        nonceHash: 'h',
        encodedToken: 'cleared',
        tokenVersion: 1,
        issuedAt: new Date(),
        consumedAt: new Date(),
        consumedByUserId: 'courier',
      },
    })
    const later = makeStop({ sequence: 3, stopId: 's3' })

    expect(selectNextUndeliveredStop([completed, consumed, later], completed)?.stopId).toBe(
      's3',
    )
  })

  it('never selects an earlier pending stop (no wraparound)', () => {
    const earlier = makeStop({ sequence: 1, stopId: 's1' })
    const completed = makeStop({ sequence: 2, stopId: 's2' })
    const next = makeStop({ sequence: 3, stopId: 's3' })

    expect(
      selectNextUndeliveredStop([earlier, completed, next], completed)?.stopId,
    ).toBe('s3')
  })

  it('returns null when no later undelivered stop exists', () => {
    const earlier = makeStop({ sequence: 1, stopId: 's1' })
    const completed = makeStop({ sequence: 5, stopId: 's5' })

    expect(selectNextUndeliveredStop([earlier, completed], completed)).toBeNull()
  })

  it('keeps a multi-order stop as one candidate', () => {
    const completed = makeStop({ sequence: 1, stopId: 's1' })
    const multi = makeStop({
      sequence: 2,
      stopId: 's2',
      orderIds: ['o1', 'o2', 'o3'],
      orderCount: 3,
    })

    expect(selectNextUndeliveredStop([completed, multi], completed)?.stopId).toBe(
      's2',
    )
  })

  it('keeps arrived-but-undelivered later stop eligible', () => {
    const completed = makeStop({ sequence: 1, stopId: 's1' })
    const arrived = makeStop({
      sequence: 2,
      stopId: 's2',
      arrival: {
        clientArrivedAt: new Date(),
        recordedAt: new Date(),
        arrivedByUserId: 'c',
        arrivedByBezorgerProfileId: 'p',
        source: 'COURIER' as never,
        idempotencyKey: 'k',
      },
    })

    expect(selectNextUndeliveredStop([completed, arrived], completed)?.stopId).toBe(
      's2',
    )
  })

  it('fails safely on duplicate sequence values', () => {
    const basis = makeStop({ sequence: 1, stopId: 's1' })
    const dupA = makeStop({ sequence: 2, stopId: 's2a' })
    const dupB = makeStop({ sequence: 2, stopId: 's2b' })

    expect(areStopSequencesValid([basis, dupA, dupB])).toBe(false)
    expect(deriveNextStop([basis, dupA, dupB], basis)).toEqual({
      ok: false,
      reason: 'invalid_sequence',
    })
    expect(selectNextUndeliveredStop([basis, dupA, dupB], basis)).toBeNull()
  })

  it('treats deliveryProof as delivered', () => {
    const stop = makeStop({
      sequence: 1,
      stopId: 's1',
      deliveryProof: {
        method: 'QR' as never,
        deliveredAt: new Date(),
        deliveredByUserId: 'c',
        associatedOrderIds: ['o'],
        recipientProfileId: 'p',
        recipientCity: 'Gent',
      },
    })
    expect(isStopDelivered(stop)).toBe(true)
  })
})
