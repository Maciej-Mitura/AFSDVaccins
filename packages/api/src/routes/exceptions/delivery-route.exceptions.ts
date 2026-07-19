import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'

export class DeliveryRouteNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Bezorgroute niet gevonden.',
      error: 'DELIVERY_ROUTE_NOT_FOUND',
    })
  }
}

export class RouteTemplateInactiveException extends BadRequestException {
  constructor() {
    super({
      message: 'Deze routetemplate is niet actief.',
      error: 'ROUTE_TEMPLATE_INACTIVE',
    })
  }
}

export class InvalidDeliveryDateException extends BadRequestException {
  constructor() {
    super({
      message: 'Ongeldige leveringsdatum. Gebruik YYYY-MM-DD.',
      error: 'INVALID_DELIVERY_DATE',
    })
  }
}

export class DeliveryRouteNotRegenerableException extends BadRequestException {
  constructor(status: string) {
    super({
      message: `Route met status ${status} kan niet opnieuw gegenereerd worden.`,
      error: 'DELIVERY_ROUTE_NOT_REGENERABLE',
      status,
    })
  }
}

export class DeliveryRouteConflictException extends ConflictException {
  constructor() {
    super({
      message: 'Er bestaat al een route voor deze bezorger en datum.',
      error: 'DELIVERY_ROUTE_CONFLICT',
    })
  }
}

export class DeliveryRouteForbiddenException extends ForbiddenException {
  constructor() {
    super({
      message: 'Je hebt geen toegang tot deze operatie.',
      error: 'FORBIDDEN',
    })
  }
}

export class InvalidRouteStatusTransitionException extends BadRequestException {
  constructor(fromStatus: string, toStatus: string) {
    super({
      message: `Statusovergang van ${fromStatus} naar ${toStatus} is niet toegestaan.`,
      error: 'INVALID_ROUTE_STATUS_TRANSITION',
      fromStatus,
      toStatus,
    })
  }
}

export class RouteCannotBeCancelledException extends BadRequestException {
  constructor(status: string) {
    super({
      message: `Route met status ${status} kan niet geannuleerd worden.`,
      error: 'ROUTE_CANNOT_BE_CANCELLED',
      status,
    })
  }
}
