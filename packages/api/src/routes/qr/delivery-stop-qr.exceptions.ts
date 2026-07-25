import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'

/**
 * Phase 26B retrieval errors — i18n-compatible `error` codes only.
 * Never include token, nonce, or signing details in messages.
 */

export class DeliveryQrNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Bezorg-QR niet gevonden.',
      error: 'DELIVERY_QR_NOT_FOUND',
    })
  }
}

export class DeliveryQrNotAvailableException extends BadRequestException {
  constructor() {
    super({
      message: 'Bezorg-QR is niet beschikbaar voor deze stop.',
      error: 'DELIVERY_QR_NOT_AVAILABLE',
    })
  }
}

export class DeliveryQrConsumedException extends BadRequestException {
  constructor() {
    super({
      message: 'Deze bezorg-QR is al gebruikt.',
      error: 'DELIVERY_QR_CONSUMED',
    })
  }
}

export class DeliveryQrRouteInactiveException extends BadRequestException {
  constructor() {
    super({
      message: 'Bezorg-QR is niet beschikbaar voor een inactieve route.',
      error: 'DELIVERY_QR_ROUTE_INACTIVE',
    })
  }
}

export class DeliveryQrForbiddenException extends ForbiddenException {
  constructor() {
    super({
      message: 'Je hebt geen toegang tot deze bezorg-QR.',
      error: 'DELIVERY_QR_FORBIDDEN',
    })
  }
}

export class DeliveryQrInvalidStateException extends BadRequestException {
  constructor() {
    super({
      message: 'Bezorg-QR metadata is ongeldig.',
      error: 'DELIVERY_QR_INVALID_STATE',
    })
  }
}
