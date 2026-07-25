import {
  assertStopEligibleForQrRetrieval,
  isRouteStatusEligibleForQrRetrieval,
} from './delivery-stop-qr-eligibility'
import {
  DeliveryQrConsumedException,
  DeliveryQrInvalidStateException,
  DeliveryQrNotAvailableException,
  DeliveryQrRouteInactiveException,
} from './delivery-stop-qr.exceptions'
import { DELIVERY_QR_TOKEN_VERSION } from './delivery-qr.constants'
import { RouteStatus } from '../route-status.enum'
import { StopQrConfirmation } from './stop-qr-confirmation.embed'

function validConfirmation(
  overrides: Partial<StopQrConfirmation> = {},
): StopQrConfirmation {
  return {
    tokenVersion: DELIVERY_QR_TOKEN_VERSION,
    nonceHash: 'a'.repeat(64),
    encodedToken: 'eyJwYXlsb2FkIjoiLi4uIn0.signature',
    issuedAt: new Date('2026-07-01T10:00:00.000Z'),
    consumedAt: null,
    consumedByUserId: null,
    ...overrides,
  }
}

describe('delivery-stop-qr-eligibility', () => {
  it('allows ASSIGNED and IN_PROGRESS only', () => {
    expect(isRouteStatusEligibleForQrRetrieval(RouteStatus.ASSIGNED)).toBe(true)
    expect(isRouteStatusEligibleForQrRetrieval(RouteStatus.IN_PROGRESS)).toBe(
      true,
    )
    expect(isRouteStatusEligibleForQrRetrieval(RouteStatus.COMPLETED)).toBe(
      false,
    )
    expect(isRouteStatusEligibleForQrRetrieval(RouteStatus.CANCELLED)).toBe(
      false,
    )
  })

  it('returns the encodedToken for an eligible stop', () => {
    const confirmation = validConfirmation()
    expect(
      assertStopEligibleForQrRetrieval(RouteStatus.ASSIGNED, {
        stopId: 'stop-1',
        qrConfirmation: confirmation,
      }),
    ).toBe(confirmation.encodedToken)
  })

  it('rejects COMPLETED and CANCELLED routes', () => {
    expect(() =>
      assertStopEligibleForQrRetrieval(RouteStatus.COMPLETED, {
        qrConfirmation: validConfirmation(),
      }),
    ).toThrow(DeliveryQrRouteInactiveException)

    expect(() =>
      assertStopEligibleForQrRetrieval(RouteStatus.CANCELLED, {
        qrConfirmation: validConfirmation(),
      }),
    ).toThrow(DeliveryQrRouteInactiveException)
  })

  it('rejects legacy stops without qrConfirmation', () => {
    expect(() =>
      assertStopEligibleForQrRetrieval(RouteStatus.ASSIGNED, {
        stopId: 'legacy',
      }),
    ).toThrow(DeliveryQrNotAvailableException)
  })

  it('rejects consumed QR', () => {
    expect(() =>
      assertStopEligibleForQrRetrieval(RouteStatus.IN_PROGRESS, {
        qrConfirmation: validConfirmation({
          consumedAt: new Date('2026-07-01T12:00:00.000Z'),
          consumedByUserId: 'courier-1',
        }),
      }),
    ).toThrow(DeliveryQrConsumedException)
  })

  it('rejects malformed persisted QR state', () => {
    expect(() =>
      assertStopEligibleForQrRetrieval(RouteStatus.ASSIGNED, {
        qrConfirmation: validConfirmation({ tokenVersion: 99 }),
      }),
    ).toThrow(DeliveryQrInvalidStateException)

    expect(() =>
      assertStopEligibleForQrRetrieval(RouteStatus.ASSIGNED, {
        qrConfirmation: validConfirmation({ nonceHash: 'not-a-hash' }),
      }),
    ).toThrow(DeliveryQrInvalidStateException)

    expect(() =>
      assertStopEligibleForQrRetrieval(RouteStatus.ASSIGNED, {
        qrConfirmation: validConfirmation({ encodedToken: 'nosig' }),
      }),
    ).toThrow(DeliveryQrInvalidStateException)

    expect(() =>
      assertStopEligibleForQrRetrieval(RouteStatus.ASSIGNED, {
        qrConfirmation: validConfirmation({
          consumedAt: new Date('2026-07-01T12:00:00.000Z'),
          consumedByUserId: null,
        }),
      }),
    ).toThrow(DeliveryQrInvalidStateException)
  })
})
