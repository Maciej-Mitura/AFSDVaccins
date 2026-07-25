import { BadRequestException } from '@nestjs/common'

/**
 * Token/crypto errors never include the signing secret or raw nonce material
 * beyond what the caller already supplied in the token under verification.
 */
export class DeliveryQrTokenInvalidException extends BadRequestException {
  constructor(reason: string = 'Delivery QR token is invalid.') {
    super({
      message: reason,
      error: 'DELIVERY_QR_TOKEN_INVALID',
    })
  }
}

export class DeliveryQrTokenUnsupportedVersionException extends BadRequestException {
  constructor(version: unknown) {
    super({
      message: 'Unsupported delivery QR token version.',
      error: 'DELIVERY_QR_TOKEN_UNSUPPORTED_VERSION',
      version: typeof version === 'number' ? version : undefined,
    })
  }
}

export class DeliveryQrSigningConfigurationException extends BadRequestException {
  constructor(message: string = 'Delivery QR signing is misconfigured.') {
    super({
      message,
      error: 'DELIVERY_QR_SIGNING_CONFIGURATION',
    })
  }
}

export class StopQrInvariantViolationException extends BadRequestException {
  constructor(message: string, code: string = 'STOP_QR_INVARIANT_VIOLATION') {
    super({
      message,
      error: code,
    })
  }
}
