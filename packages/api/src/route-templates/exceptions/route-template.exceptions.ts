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

export class RouteTemplateNotAssignedException extends NotFoundException {
  constructor() {
    super({
      message: 'Er is geen actieve routetemplate aan jouw bezorgerprofiel gekoppeld.',
      error: 'ROUTE_TEMPLATE_NOT_ASSIGNED',
    })
  }
}

/**
 * Data-integrity conflict: more than one active RouteTemplate for one courier.
 * Stable code for PWA mapping. Prefer repair over arbitrary selection.
 */
export class MultipleActiveRouteTemplatesException extends ConflictException {
  constructor() {
    super({
      message:
        'Er zijn meerdere actieve routetemplates aan jouw bezorgerprofiel gekoppeld. Vraag een beheerder om de dubbele toewijzing te herstellen. / Multiple active route templates are linked to your courier profile. Ask an administrator to resolve the duplicate assignment.',
      error: 'ROUTE_TEMPLATE_MULTIPLE_ACTIVE_FOR_COURIER',
    })
  }
}

export class RouteTemplateActiveOwnerConflictException extends ConflictException {
  constructor() {
    super({
      message:
        'Another active route template for this courier was created concurrently. Retry the operation.',
      error: 'ROUTE_TEMPLATE_ACTIVE_OWNER_CONFLICT',
    })
  }
}
