import { hashDeliveryQrNonce } from './delivery-qr-nonce.util'
import { StopQrInvariantViolationException } from './delivery-qr.exceptions'
import type { DeliveryQrTokenPayload, DeliveryQrTokenService } from './delivery-qr-token.types'
import type { StopQrConfirmation } from './stop-qr-confirmation.embed'

/**
 * Verifies a persisted `encodedToken` against HMAC and the stored `nonceHash`.
 * Used by unit tests now and by scan/confirm paths later (26B/26C).
 */
export function verifyPersistedStopQrToken(
  tokenService: DeliveryQrTokenService,
  confirmation: StopQrConfirmation,
  expected?: { routeId?: string; stopId?: string },
): DeliveryQrTokenPayload {
  const payload = tokenService.verify(confirmation.encodedToken)

  if (hashDeliveryQrNonce(payload.nonce) !== confirmation.nonceHash) {
    throw new StopQrInvariantViolationException(
      'encodedToken nonce does not match persisted nonceHash.',
      'STOP_QR_TOKEN_NONCE_MISMATCH',
    )
  }

  if (
    expected?.routeId != null &&
    payload.routeId !== expected.routeId
  ) {
    throw new StopQrInvariantViolationException(
      'encodedToken routeId does not match the delivery route.',
      'STOP_QR_TOKEN_ROUTE_MISMATCH',
    )
  }

  if (expected?.stopId != null && payload.stopId !== expected.stopId) {
    throw new StopQrInvariantViolationException(
      'encodedToken stopId does not match the delivery stop.',
      'STOP_QR_TOKEN_STOP_MISMATCH',
    )
  }

  return payload
}
