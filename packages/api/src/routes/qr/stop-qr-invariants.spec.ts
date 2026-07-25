import { DeliveryProofMethod } from './delivery-proof-method.enum'
import { DELIVERY_QR_TOKEN_VERSION } from './delivery-qr.constants'
import { StopQrInvariantViolationException } from './delivery-qr.exceptions'
import {
  assertStopQrInvariants,
  getStopDeliveredAt,
  isStopQrAvailable,
  isStopQrConsumed,
} from './stop-qr-invariants'
import type { StopDeliveryProof } from './stop-delivery-proof.embed'
import type { StopQrConfirmation } from './stop-qr-confirmation.embed'

const ORDER_A = '707f1f77bcf86cd799439031'
const ORDER_B = '707f1f77bcf86cd799439032'
const COURIER = '507f1f77bcf86cd799439050'
const PROFILE = '607f1f77bcf86cd799439011'

function unconsumedConfirmation(): StopQrConfirmation {
  return {
    tokenVersion: DELIVERY_QR_TOKEN_VERSION,
    nonceHash: 'a'.repeat(64),
    encodedToken: 'dGVzdA.dGVzdA',
    issuedAt: new Date('2026-07-25T10:00:00.000Z'),
    consumedAt: null,
    consumedByUserId: null,
  }
}

function consumedConfirmation(): StopQrConfirmation {
  return {
    ...unconsumedConfirmation(),
    consumedAt: new Date('2026-07-25T12:00:00.000Z'),
    consumedByUserId: COURIER,
  }
}

function validProof(): StopDeliveryProof {
  return {
    method: DeliveryProofMethod.QR,
    deliveredAt: new Date('2026-07-25T12:00:00.000Z'),
    deliveredByUserId: COURIER,
    associatedOrderIds: [ORDER_A, ORDER_B],
    recipientProfileId: PROFILE,
    recipientCity: 'Gent',
    confirmationEventId: null,
  }
}

describe('stop QR invariants', () => {
  it('allows legacy stops without QR state', () => {
    expect(() =>
      assertStopQrInvariants({
        orderIds: [ORDER_A],
        apothekerProfileId: PROFILE,
      }),
    ).not.toThrow()
    expect(
      isStopQrAvailable({
        orderIds: [ORDER_A],
      }),
    ).toBe(false)
    expect(isStopQrConsumed({})).toBe(false)
    expect(getStopDeliveredAt({})).toBeNull()
  })

  it('accepts a fresh unconsumed confirmation', () => {
    const stop = {
      stopId: 'stop-1',
      orderIds: [ORDER_A],
      apothekerProfileId: PROFILE,
      qrConfirmation: unconsumedConfirmation(),
    }

    expect(() => assertStopQrInvariants(stop)).not.toThrow()
    expect(isStopQrAvailable(stop)).toBe(true)
    expect(isStopQrConsumed(stop)).toBe(false)
  })

  it('rejects invalid consumed-field combinations', () => {
    expect(() =>
      assertStopQrInvariants({
        orderIds: [ORDER_A],
        qrConfirmation: {
          ...unconsumedConfirmation(),
          consumedAt: new Date(),
          consumedByUserId: null,
        },
      }),
    ).toThrow(StopQrInvariantViolationException)

    expect(() =>
      assertStopQrInvariants({
        orderIds: [ORDER_A],
        qrConfirmation: {
          ...unconsumedConfirmation(),
          consumedAt: null,
          consumedByUserId: COURIER,
        },
      }),
    ).toThrow(StopQrInvariantViolationException)
  })

  it('rejects deliveryProof without consumed confirmation', () => {
    expect(() =>
      assertStopQrInvariants({
        orderIds: [ORDER_A, ORDER_B],
        apothekerProfileId: PROFILE,
        qrConfirmation: unconsumedConfirmation(),
        deliveryProof: validProof(),
      }),
    ).toThrow(StopQrInvariantViolationException)

    expect(() =>
      assertStopQrInvariants({
        orderIds: [ORDER_A, ORDER_B],
        apothekerProfileId: PROFILE,
        deliveryProof: validProof(),
      }),
    ).toThrow(StopQrInvariantViolationException)
  })

  it('rejects deliveryProof whose orders are not on the stop', () => {
    expect(() =>
      assertStopQrInvariants(
        {
          orderIds: [ORDER_A],
          apothekerProfileId: PROFILE,
          qrConfirmation: consumedConfirmation(),
          deliveryProof: validProof(),
        },
        { assignedCourierUserId: COURIER },
      ),
    ).toThrow(StopQrInvariantViolationException)
  })

  it('rejects deliveryProof from a courier other than the assigned route courier', () => {
    expect(() =>
      assertStopQrInvariants(
        {
          orderIds: [ORDER_A, ORDER_B],
          apothekerProfileId: PROFILE,
          qrConfirmation: consumedConfirmation(),
          deliveryProof: validProof(),
        },
        { assignedCourierUserId: '507f1f77bcf86cd799439099' },
      ),
    ).toThrow(StopQrInvariantViolationException)
  })

  it('accepts a consistent consumed confirmation with deliveryProof', () => {
    const stop = {
      orderIds: [ORDER_A, ORDER_B],
      apothekerProfileId: PROFILE,
      qrConfirmation: consumedConfirmation(),
      deliveryProof: validProof(),
    }

    expect(() =>
      assertStopQrInvariants(stop, { assignedCourierUserId: COURIER }),
    ).not.toThrow()
    expect(isStopQrAvailable(stop)).toBe(false)
    expect(isStopQrConsumed(stop)).toBe(true)
    expect(getStopDeliveredAt(stop)?.toISOString()).toBe(
      '2026-07-25T12:00:00.000Z',
    )
  })

  it('rejects empty nonce hashes and unsupported token versions', () => {
    expect(() =>
      assertStopQrInvariants({
        orderIds: [ORDER_A],
        qrConfirmation: {
          ...unconsumedConfirmation(),
          nonceHash: '',
        },
      }),
    ).toThrow(StopQrInvariantViolationException)

    expect(() =>
      assertStopQrInvariants({
        orderIds: [ORDER_A],
        qrConfirmation: {
          ...unconsumedConfirmation(),
          tokenVersion: 99,
        },
      }),
    ).toThrow(StopQrInvariantViolationException)
  })
})
