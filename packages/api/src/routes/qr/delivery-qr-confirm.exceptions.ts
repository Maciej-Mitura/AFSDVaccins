import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'

/**
 * Phase 26D courier QR confirmation errors — i18n-compatible `error` codes only.
 * Never include token, nonce, signature, or encodedToken in messages.
 */

export class DeliveryQrConfirmTokenRequiredException extends BadRequestException {
  constructor() {
    super({
      message: 'Bezorg-QR token is verplicht.',
      error: 'DELIVERY_QR_TOKEN_REQUIRED',
    })
  }
}

export class DeliveryQrConfirmTokenInvalidException extends BadRequestException {
  constructor() {
    super({
      message: 'Bezorg-QR token is ongeldig.',
      error: 'DELIVERY_QR_TOKEN_INVALID',
    })
  }
}

export class DeliveryQrConfirmVersionUnsupportedException extends BadRequestException {
  constructor() {
    super({
      message: 'Bezorg-QR tokenversie wordt niet ondersteund.',
      error: 'DELIVERY_QR_VERSION_UNSUPPORTED',
    })
  }
}

export class DeliveryQrConfirmRouteNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Bezorgroute niet gevonden.',
      error: 'DELIVERY_QR_ROUTE_NOT_FOUND',
    })
  }
}

export class DeliveryQrConfirmForbiddenException extends ForbiddenException {
  constructor() {
    super({
      message: 'Je hebt geen toegang tot deze bezorg-QR-bevestiging.',
      error: 'DELIVERY_QR_FORBIDDEN',
    })
  }
}

export class DeliveryQrConfirmRouteNotStartedException extends BadRequestException {
  constructor() {
    super({
      message: 'De bezorgroute is nog niet gestart.',
      error: 'DELIVERY_QR_ROUTE_NOT_STARTED',
    })
  }
}

export class DeliveryQrConfirmRouteInactiveException extends BadRequestException {
  constructor() {
    super({
      message: 'Bezorg-QR-bevestiging is niet beschikbaar voor een inactieve route.',
      error: 'DELIVERY_QR_ROUTE_INACTIVE',
    })
  }
}

export class DeliveryQrConfirmStopNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Bezorgstop niet gevonden.',
      error: 'DELIVERY_QR_STOP_NOT_FOUND',
    })
  }
}

/** Already consumed — conflict on the confirm path (HTTP 409). */
export class DeliveryQrConfirmConsumedException extends ConflictException {
  constructor() {
    super({
      message: 'Deze bezorg-QR is al gebruikt.',
      error: 'DELIVERY_QR_CONSUMED',
    })
  }
}

/** Stop already has delivery proof — conflict on the confirm path (HTTP 409). */
export class DeliveryQrConfirmStopAlreadyDeliveredException extends ConflictException {
  constructor() {
    super({
      message: 'Deze bezorgstop is al afgeleverd.',
      error: 'DELIVERY_QR_STOP_ALREADY_DELIVERED',
    })
  }
}

export class DeliveryQrConfirmOrderIntegrityException extends BadRequestException {
  constructor() {
    super({
      message: 'Bestellingen voor deze stop zijn inconsistent.',
      error: 'DELIVERY_QR_ORDER_INTEGRITY_ERROR',
    })
  }
}

/** Lost a concurrent confirmation race — stable conflict (HTTP 409). */
export class DeliveryQrConfirmationConflictException extends ConflictException {
  constructor() {
    super({
      message: 'Bevestiging conflicteert met een gelijktijdige poging.',
      error: 'DELIVERY_QR_CONFIRMATION_CONFLICT',
    })
  }
}

/** Another confirmation is already PROCESSING this stop (HTTP 409). */
export class DeliveryQrConfirmationInProgressException extends ConflictException {
  constructor() {
    super({
      message: 'Bevestiging van deze stop is al bezig.',
      error: 'DELIVERY_QR_CONFIRMATION_IN_PROGRESS',
    })
  }
}

/** Persistence unit of work failed after validation — no success response. */
export class DeliveryQrConfirmationFailedException extends InternalServerErrorException {
  constructor() {
    super({
      message: 'Bezorgbevestiging is mislukt.',
      error: 'DELIVERY_QR_CONFIRMATION_FAILED',
    })
  }
}

/**
 * Maps crypto-layer exceptions to confirm-safe codes without leaking diagnostics.
 */
export function mapCryptoExceptionToConfirm(error: unknown): never {
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
      throw new DeliveryQrConfirmVersionUnsupportedException()
    }
  }

  throw new DeliveryQrConfirmTokenInvalidException()
}
