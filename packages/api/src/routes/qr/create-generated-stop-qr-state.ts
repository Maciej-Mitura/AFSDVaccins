import { DELIVERY_QR_TOKEN_VERSION } from './delivery-qr.constants'
import {
  generateDeliveryQrNonce,
  generateDeliveryStopId,
  hashDeliveryQrNonce,
  type DeliveryQrRandomSource,
  systemDeliveryQrRandomSource,
} from './delivery-qr-nonce.util'
import type { DeliveryQrTokenService } from './delivery-qr-token.types'
import { assertStopQrInvariants } from './stop-qr-invariants'
import { StopQrConfirmation } from './stop-qr-confirmation.embed'

export type CreateGeneratedStopQrStateInput = {
  routeId: string
  tokenService: DeliveryQrTokenService
  random?: DeliveryQrRandomSource
  issuedAt?: Date
}

export type GeneratedStopQrState = {
  stopId: string
  qrConfirmation: StopQrConfirmation
}

/**
 * Creates fresh unconsumed QR confirmation metadata for a generated stop.
 *
 * 1. Generate cryptographically random plaintext nonce
 * 2. Persist `nonceHash` (SHA-256)
 * 3. Mint signed v1 token (routeId, stopId, nonce, version)
 * 4. Persist `encodedToken`
 * 5. Discard plaintext nonce (not returned, not stored)
 */
export function createGeneratedStopQrState(
  input: CreateGeneratedStopQrStateInput,
): GeneratedStopQrState {
  const random = input.random ?? systemDeliveryQrRandomSource
  const issuedAt = input.issuedAt ?? new Date()
  const stopId = generateDeliveryStopId(random)
  const nonce = generateDeliveryQrNonce(random)
  const nonceHash = hashDeliveryQrNonce(nonce)
  const encodedToken = input.tokenService.sign({
    routeId: input.routeId,
    stopId,
    nonce,
    version: DELIVERY_QR_TOKEN_VERSION,
  })

  const qrConfirmation: StopQrConfirmation = {
    tokenVersion: DELIVERY_QR_TOKEN_VERSION,
    nonceHash,
    encodedToken,
    issuedAt,
    consumedAt: null,
    consumedByUserId: null,
  }

  assertStopQrInvariants({
    stopId,
    orderIds: [],
    qrConfirmation,
  })

  return { stopId, qrConfirmation }
}
