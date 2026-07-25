import { timingSafeEqual } from 'node:crypto'

import { DELIVERY_QR_TOKEN_VERSION } from './delivery-qr.constants'
import { hashDeliveryQrNonce } from './delivery-qr-nonce.util'
import type {
  DeliveryQrTokenPayload,
  DeliveryQrTokenService,
} from './delivery-qr-token.types'
import {
  DeliveryQrPreviewTokenInvalidException,
  DeliveryQrVersionUnsupportedException,
  mapCryptoExceptionToPreview,
} from './delivery-qr-preview.exceptions'
import type { StopQrConfirmation } from './stop-qr-confirmation.embed'

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isValidNonceHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
}

/**
 * Timing-safe equality for equal-length hex digests (nonce hashes).
 * Returns false when lengths differ (without leaking via timingSafeEqual throw).
 */
export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')

  if (left.length !== right.length) {
    return false
  }

  return timingSafeEqual(left, right)
}

/**
 * Verifies a *submitted* scan token against persisted stop QR state.
 *
 * Does not treat equality of the full `encodedToken` string as the sole check:
 * HMAC signature is verified, then the token nonce is hashed and compared to
 * `nonceHash` with a timing-safe compare.
 */
export function verifySubmittedStopQrToken(
  tokenService: DeliveryQrTokenService,
  submittedToken: string,
  confirmation: StopQrConfirmation,
  expected: { routeId: string; stopId: string },
): DeliveryQrTokenPayload {
  let payload: DeliveryQrTokenPayload

  try {
    payload = tokenService.verify(submittedToken)
  } catch (error) {
    mapCryptoExceptionToPreview(error)
  }

  if (payload.v !== DELIVERY_QR_TOKEN_VERSION) {
    throw new DeliveryQrVersionUnsupportedException()
  }

  if (confirmation.tokenVersion !== DELIVERY_QR_TOKEN_VERSION) {
    throw new DeliveryQrVersionUnsupportedException()
  }

  if (!isValidNonceHash(confirmation.nonceHash)) {
    throw new DeliveryQrPreviewTokenInvalidException()
  }

  const submittedNonceHash = hashDeliveryQrNonce(payload.nonce)
  if (!safeEqualHex(submittedNonceHash, confirmation.nonceHash)) {
    throw new DeliveryQrPreviewTokenInvalidException()
  }

  if (
    payload.routeId !== expected.routeId ||
    payload.stopId !== expected.stopId
  ) {
    throw new DeliveryQrPreviewTokenInvalidException()
  }

  if (
    !hasText(confirmation.encodedToken) ||
    !confirmation.encodedToken.includes('.')
  ) {
    throw new DeliveryQrPreviewTokenInvalidException()
  }

  return payload
}
