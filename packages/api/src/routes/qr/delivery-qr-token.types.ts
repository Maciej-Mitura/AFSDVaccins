import { DELIVERY_QR_TOKEN_VERSION } from './delivery-qr.constants'

export type DeliveryQrTokenVersion = typeof DELIVERY_QR_TOKEN_VERSION

/**
 * Bounded claims only — pharmacy/order details stay server-authoritative.
 * `nonce` is base64url-encoded raw random bytes.
 */
export type DeliveryQrTokenPayloadV1 = {
  v: DeliveryQrTokenVersion
  routeId: string
  stopId: string
  nonce: string
}

export type DeliveryQrTokenPayload = DeliveryQrTokenPayloadV1

export type DeliveryQrSignInput = {
  routeId: string
  stopId: string
  nonce: string
  version?: DeliveryQrTokenVersion
}

/**
 * Provider-neutral QR token contract.
 * Implementations must authenticate the payload (e.g. HMAC-SHA-256).
 */
export interface DeliveryQrTokenService {
  sign(input: DeliveryQrSignInput): string
  verify(token: string): DeliveryQrTokenPayload
}
