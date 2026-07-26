import { DeliveryStop } from '../routes/delivery-stop.embed'
import {
  isStopDelivered,
  selectNextUndeliveredStop,
} from './next-stop-selection'

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

describe('selectNextUndeliveredStop', () => {
  it('selects the next higher-sequence undelivered stop', () => {
    const completed = makeStop({ sequence: 1, stopId: 's1', pharmacyName: 'A' })
    const next = makeStop({
      sequence: 2,
      stopId: 's2',
      pharmacyName: 'B',
      apothekerUserId: 'user-b',
    })
    const later = makeStop({ sequence: 3, stopId: 's3', pharmacyName: 'C' })

    expect(selectNextUndeliveredStop([later, next, completed], completed)).toEqual(
      next,
    )
  })

  it('skips an already-delivered next sequence stop', () => {
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
    const later = makeStop({ sequence: 3, stopId: 's3', pharmacyName: 'Later' })

    expect(
      selectNextUndeliveredStop([completed, deliveredNext, later], completed)
        ?.stopId,
    ).toBe('s3')
  })

  it('does not select an earlier undelivered stop', () => {
    const earlier = makeStop({ sequence: 1, stopId: 's1' })
    const completed = makeStop({ sequence: 2, stopId: 's2' })
    const next = makeStop({ sequence: 3, stopId: 's3' })

    expect(
      selectNextUndeliveredStop([earlier, completed, next], completed)?.stopId,
    ).toBe('s3')
  })

  it('returns null when no later undelivered stop exists', () => {
    const completed = makeStop({ sequence: 2, stopId: 's2' })
    const earlier = makeStop({ sequence: 1, stopId: 's1' })

    expect(selectNextUndeliveredStop([earlier, completed], completed)).toBeNull()
  })

  it('treats consumed QR without wrapping as delivered', () => {
    const stop = makeStop({
      sequence: 1,
      stopId: 's1',
      qrConfirmation: {
        nonceHash: 'h',
        encodedToken: 'cleared',
        tokenVersion: 1,
        issuedAt: new Date(),
        consumedAt: new Date(),
        consumedByUserId: 'courier',
      },
    })
    expect(isStopDelivered(stop)).toBe(true)
  })
})
