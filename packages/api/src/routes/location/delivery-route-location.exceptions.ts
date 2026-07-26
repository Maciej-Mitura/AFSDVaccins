import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'

/**
 * Phase 30A coarse location errors — stable internal/domain codes.
 * Never include CAS/database details, GPS, or QR material.
 */

export class DeliveryLocationRouteNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Bezorgroute niet gevonden voor locatie-update.',
      error: 'DELIVERY_LOCATION_ROUTE_NOT_FOUND',
    })
  }
}

export class DeliveryLocationStopNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Bezorgstop niet gevonden voor locatie-update.',
      error: 'DELIVERY_LOCATION_STOP_NOT_FOUND',
    })
  }
}

export class DeliveryLocationRouteInactiveException extends BadRequestException {
  constructor() {
    super({
      message:
        'Locatie bijwerken is niet beschikbaar voor een inactieve route.',
      error: 'DELIVERY_LOCATION_ROUTE_INACTIVE',
    })
  }
}

export class DeliveryLocationCityUnavailableException extends BadRequestException {
  constructor() {
    super({
      message: 'Geen stadsnaam beschikbaar op de gegenereerde stop.',
      error: 'DELIVERY_LOCATION_CITY_UNAVAILABLE',
    })
  }
}

export class DeliveryLocationInvalidSequenceException extends BadRequestException {
  constructor() {
    super({
      message: 'Ongeldige of dubbele stopvolgorde op de route.',
      error: 'DELIVERY_LOCATION_INVALID_SEQUENCE',
    })
  }
}

export class DeliveryLocationStaleEventException extends ConflictException {
  constructor() {
    super({
      message: 'Locatie-event is verouderd ten opzichte van de huidige status.',
      error: 'DELIVERY_LOCATION_STALE_EVENT',
    })
  }
}

export class DeliveryLocationUpdateFailedException extends InternalServerErrorException {
  constructor() {
    super({
      message: 'Locatie bijwerken is mislukt.',
      error: 'DELIVERY_LOCATION_UPDATE_FAILED',
    })
  }
}
