import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'

/**
 * Phase 28C courier stop-arrival errors — stable i18n-compatible `error` codes.
 * Never include bearer tokens, QR material, or full pending-action payloads.
 */

export class DeliveryArrivalRouteNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Bezorgroute niet gevonden.',
      error: 'DELIVERY_ARRIVAL_ROUTE_NOT_FOUND',
    })
  }
}

export class DeliveryArrivalStopNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Bezorgstop niet gevonden.',
      error: 'DELIVERY_ARRIVAL_STOP_NOT_FOUND',
    })
  }
}

export class DeliveryArrivalForbiddenException extends ForbiddenException {
  constructor() {
    super({
      message:
        'Je hebt geen toegang om aankomst voor deze route te registreren.',
      error: 'DELIVERY_ARRIVAL_FORBIDDEN',
    })
  }
}

export class DeliveryArrivalRouteNotStartedException extends BadRequestException {
  constructor() {
    super({
      message: 'De bezorgroute is nog niet gestart.',
      error: 'DELIVERY_ARRIVAL_ROUTE_NOT_STARTED',
    })
  }
}

export class DeliveryArrivalRouteInactiveException extends BadRequestException {
  constructor() {
    super({
      message:
        'Aankomst registreren is niet beschikbaar voor een inactieve route.',
      error: 'DELIVERY_ARRIVAL_ROUTE_INACTIVE',
    })
  }
}

export class DeliveryArrivalStopAlreadyDeliveredException extends ConflictException {
  constructor() {
    super({
      message: 'Deze bezorgstop is al afgeleverd.',
      error: 'DELIVERY_ARRIVAL_STOP_ALREADY_DELIVERED',
    })
  }
}

export class DeliveryArrivalAlreadyRecordedException extends ConflictException {
  constructor() {
    super({
      message: 'Aankomst is al geregistreerd voor deze stop.',
      error: 'DELIVERY_ARRIVAL_ALREADY_RECORDED',
    })
  }
}

export class DeliveryArrivalTimestampInvalidException extends BadRequestException {
  constructor() {
    super({
      message: 'Ongeldig aankomsttijdstip van het apparaat.',
      error: 'DELIVERY_ARRIVAL_TIMESTAMP_INVALID',
    })
  }
}

export class DeliveryArrivalConflictException extends ConflictException {
  constructor() {
    super({
      message: 'Aankomst conflicteert met een gelijktijdige wijziging.',
      error: 'DELIVERY_ARRIVAL_CONFLICT',
    })
  }
}

export class DeliveryArrivalFailedException extends InternalServerErrorException {
  constructor() {
    super({
      message: 'Aankomst registreren is mislukt.',
      error: 'DELIVERY_ARRIVAL_FAILED',
    })
  }
}

export class DeliveryArrivalIdempotencyKeyInvalidException extends BadRequestException {
  constructor() {
    super({
      message: 'Ongeldige idempotency-sleutel.',
      error: 'DELIVERY_ARRIVAL_FAILED',
    })
  }
}
