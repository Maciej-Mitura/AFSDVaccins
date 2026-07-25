import { createHmac, timingSafeEqual } from 'node:crypto'

import {
  DELIVERY_QR_SIGNING_SECRET_MIN_LENGTH,
  DELIVERY_QR_TOKEN_VERSION,
} from './delivery-qr.constants'
import {
  DeliveryQrSigningConfigurationException,
  DeliveryQrTokenInvalidException,
  DeliveryQrTokenUnsupportedVersionException,
} from './delivery-qr.exceptions'
import type {
  DeliveryQrSignInput,
  DeliveryQrTokenPayload,
  DeliveryQrTokenPayloadV1,
  DeliveryQrTokenService,
} from './delivery-qr-token.types'

function assertSecret(secret: string): void {
  if (
    typeof secret !== 'string' ||
    secret.length < DELIVERY_QR_SIGNING_SECRET_MIN_LENGTH
  ) {
    throw new DeliveryQrSigningConfigurationException(
      `DELIVERY_QR_SIGNING_SECRET must be at least ${DELIVERY_QR_SIGNING_SECRET_MIN_LENGTH} characters.`,
    )
  }
}

function encodePayload(payload: DeliveryQrTokenPayloadV1): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function signEncoded(secret: string, encodedPayload: string): string {
  return createHmac('sha256', secret)
    .update(encodedPayload, 'utf8')
    .digest('base64url')
}

function safeEqualBase64Url(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')

  if (left.length !== right.length) {
    return false
  }

  return timingSafeEqual(left, right)
}

function parsePayload(encoded: string): DeliveryQrTokenPayloadV1 {
  let json: unknown

  try {
    json = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    throw new DeliveryQrTokenInvalidException('Malformed delivery QR token.')
  }

  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    throw new DeliveryQrTokenInvalidException('Malformed delivery QR token.')
  }

  const record = json as Record<string, unknown>
  const version = record.v

  if (version !== DELIVERY_QR_TOKEN_VERSION) {
    throw new DeliveryQrTokenUnsupportedVersionException(version)
  }

  const routeId = record.routeId
  const stopId = record.stopId
  const nonce = record.nonce

  if (
    typeof routeId !== 'string' ||
    routeId.length === 0 ||
    typeof stopId !== 'string' ||
    stopId.length === 0 ||
    typeof nonce !== 'string' ||
    nonce.length === 0
  ) {
    throw new DeliveryQrTokenInvalidException('Malformed delivery QR token.')
  }

  // Reject unexpected claim keys so the payload stays bounded.
  const keys = Object.keys(record).sort()
  if (keys.join(',') !== 'nonce,routeId,stopId,v') {
    throw new DeliveryQrTokenInvalidException('Malformed delivery QR token.')
  }

  return {
    v: DELIVERY_QR_TOKEN_VERSION,
    routeId,
    stopId,
    nonce,
  }
}

/**
 * HMAC-SHA-256 authenticated QR token (version 1).
 *
 * Wire format: `<base64url(json-payload)>.<base64url(hmac)>`
 * Payload claims: `v`, `routeId`, `stopId`, `nonce` only.
 */
export class HmacDeliveryQrTokenService implements DeliveryQrTokenService {
  private readonly secret: string

  constructor(secret: string) {
    assertSecret(secret)
    this.secret = secret
  }

  sign(input: DeliveryQrSignInput): string {
    const version = input.version ?? DELIVERY_QR_TOKEN_VERSION

    if (version !== DELIVERY_QR_TOKEN_VERSION) {
      throw new DeliveryQrTokenUnsupportedVersionException(version)
    }

    if (
      typeof input.routeId !== 'string' ||
      input.routeId.length === 0 ||
      typeof input.stopId !== 'string' ||
      input.stopId.length === 0 ||
      typeof input.nonce !== 'string' ||
      input.nonce.length === 0
    ) {
      throw new DeliveryQrTokenInvalidException(
        'Delivery QR token claims are incomplete.',
      )
    }

    const payload: DeliveryQrTokenPayloadV1 = {
      v: DELIVERY_QR_TOKEN_VERSION,
      routeId: input.routeId,
      stopId: input.stopId,
      nonce: input.nonce,
    }

    const encodedPayload = encodePayload(payload)
    const signature = signEncoded(this.secret, encodedPayload)
    return `${encodedPayload}.${signature}`
  }

  verify(token: string): DeliveryQrTokenPayload {
    if (typeof token !== 'string' || token.length === 0) {
      throw new DeliveryQrTokenInvalidException('Malformed delivery QR token.')
    }

    // Never echo the token or secret into logs/errors beyond a generic message.
    const parts = token.split('.')
    if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
      throw new DeliveryQrTokenInvalidException('Malformed delivery QR token.')
    }

    const [encodedPayload, providedSignature] = parts
    const expectedSignature = signEncoded(this.secret, encodedPayload)

    if (!safeEqualBase64Url(providedSignature, expectedSignature)) {
      throw new DeliveryQrTokenInvalidException(
        'Delivery QR token signature is invalid.',
      )
    }

    return parsePayload(encodedPayload)
  }
}
