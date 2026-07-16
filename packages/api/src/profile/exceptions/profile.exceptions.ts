import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'

export class ApothekerProfileNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Apotheker profile not found',
      error: 'APOTHEKER_PROFILE_NOT_FOUND',
    })
  }
}

export class BezorgerProfileNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Bezorger profile not found',
      error: 'BEZORGER_PROFILE_NOT_FOUND',
    })
  }
}

export class ProfileInvalidException extends BadRequestException {
  constructor(message = 'Invalid profile data') {
    super({
      message,
      error: 'PROFILE_INVALID',
    })
  }
}

export class ProfileForbiddenException extends ForbiddenException {
  constructor() {
    super({
      message: 'Forbidden',
      error: 'FORBIDDEN',
    })
  }
}
