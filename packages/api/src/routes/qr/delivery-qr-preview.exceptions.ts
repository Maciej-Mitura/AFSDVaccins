import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common'

/**
 * Phase 26C courier QR scan-preview errors — i18n-compatible `error` codes only.
 * Never include token, nonce, signature, or encodedToken in messages.
 */

export class DeliveryQrTokenRequiredException extends BadRequestException {
  constructor() {
    super({
      message: 'Bezorg-QR token is verplicht.',
      error: 'DELIVERY_QR_TOKEN_REQUIRED',
    })
  }
}

export class DeliveryQrPreviewTokenInvalidException extends BadRequestException {
  constructor() {
    super({
      message: 'Bezorg-QR token is ongeldig.',
      error: 'DELIVERY_QR_TOKEN_INVALID',
    })
  }
}

export class DeliveryQrVersionUnsupportedException extends BadRequestException {
  constructor() {
    super({
      message: 'Bezorg-QR tokenversie wordt niet ondersteund.',
      error: 'DELIVERY_QR_VERSION_UNSUPPORTED',
    })
  }
}

export class DeliveryQrRouteNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Bezorgroute niet gevonden.',
      error: 'DELIVERY_QR_ROUTE_NOT_FOUND',
    })
  }
}

export class DeliveryQrPreviewForbiddenException extends ForbiddenException {
  constructor() {
    super({
      message: 'Je hebt geen toegang tot deze bezorg-QR-preview.',
      error: 'DELIVERY_QR_FORBIDDEN',
    })
  }
}

export class DeliveryQrRouteNotStartedException extends BadRequestException {
  constructor() {
    super({
      message: 'De bezorgroute is nog niet gestart.',
      error: 'DELIVERY_QR_ROUTE_NOT_STARTED',
    })
  }
}

export class DeliveryQrPreviewRouteInactiveException extends BadRequestException {
  constructor() {
    super({
      message: 'Bezorg-QR-preview is niet beschikbaar voor een inactieve route.',
      error: 'DELIVERY_QR_ROUTE_INACTIVE',
    })
  }
}

export class DeliveryQrStopNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Bezorgstop niet gevonden.',
      error: 'DELIVERY_QR_STOP_NOT_FOUND',
    })
  }
}

export class DeliveryQrPreviewConsumedException extends BadRequestException {
  constructor() {
    super({
      message: 'Deze bezorg-QR is al gebruikt.',
      error: 'DELIVERY_QR_CONSUMED',
    })
  }
}

export class DeliveryQrStopAlreadyDeliveredException extends BadRequestException {
  constructor() {
    super({
      message: 'Deze bezorgstop is al afgeleverd.',
      error: 'DELIVERY_QR_STOP_ALREADY_DELIVERED',
    })
  }
}

export class DeliveryQrOrderIntegrityException extends BadRequestException {
  constructor() {
    super({
      message: 'Bestellingen voor deze stop zijn inconsistent.',
      error: 'DELIVERY_QR_ORDER_INTEGRITY_ERROR',
    })
  }
}

/**
 * Maps crypto-layer exceptions to preview-safe codes without leaking diagnostics.
 */
export function mapCryptoExceptionToPreview(error: unknown): never {
  if (error instanceof HttpException && error.getStatus() === 400) {
    const body = error.getResponse()
    const code =
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : undefined

    if (
      code === 'DELIVERY_QR_TOKEN_UNSUPPORTED_VERSION' ||
      code === 'DELIVERY_QR_VERSION_UNSUPPORTED'
    ) {
      throw new DeliveryQrVersionUnsupportedException()
    }
  }

  throw new DeliveryQrPreviewTokenInvalidException()
}
