import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common'

export class RouteTemplateNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Route template not found',
      error: 'ROUTE_TEMPLATE_NOT_FOUND',
    })
  }
}

export class RouteTemplateAlreadyExistsException extends ConflictException {
  constructor() {
    super({
      message: 'A route template with this name already exists',
      error: 'ROUTE_TEMPLATE_ALREADY_EXISTS',
    })
  }
}

export class RouteTemplateInvalidException extends BadRequestException {
  constructor(message: string, error = 'ROUTE_TEMPLATE_INVALID') {
    super({
      message,
      error,
    })
  }
}

export class RouteTemplateEmptyStopsException extends BadRequestException {
  constructor() {
    super({
      message: 'A route template requires at least one stop',
      error: 'ROUTE_TEMPLATE_EMPTY_STOPS',
    })
  }
}

export class RouteTemplateDuplicateStopException extends BadRequestException {
  constructor() {
    super({
      message: 'Duplicate apotheker profiles are not allowed in one template',
      error: 'ROUTE_TEMPLATE_DUPLICATE_STOP',
    })
  }
}
