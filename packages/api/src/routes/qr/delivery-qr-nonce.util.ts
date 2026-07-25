import { createHash, randomBytes, randomUUID } from 'node:crypto'

import {
  DELIVERY_QR_NONCE_BYTES,
  DELIVERY_QR_RANDOM_SOURCE,
} from './delivery-qr.constants'

export type DeliveryQrRandomSource = {
  /** Cryptographically secure random bytes. */
  randomBytes(size: number): Buffer
  /** Stable per-stop identifier (not secret). */
  randomStopId(): string
}

export const systemDeliveryQrRandomSource: DeliveryQrRandomSource = {
  randomBytes,
  randomStopId: () => randomUUID(),
}

export { DELIVERY_QR_RANDOM_SOURCE }

/** SHA-256 hex digest of a base64url (or utf8) nonce string. */
export function hashDeliveryQrNonce(nonce: string): string {
  return createHash('sha256').update(nonce, 'utf8').digest('hex')
}

/** Generate a base64url nonce of {@link DELIVERY_QR_NONCE_BYTES} random bytes. */
export function generateDeliveryQrNonce(
  random: DeliveryQrRandomSource = systemDeliveryQrRandomSource,
): string {
  return random.randomBytes(DELIVERY_QR_NONCE_BYTES).toString('base64url')
}

export function generateDeliveryStopId(
  random: DeliveryQrRandomSource = systemDeliveryQrRandomSource,
): string {
  return random.randomStopId()
}
