import { ConflictException, NotFoundException } from '@nestjs/common'

export class VaccineNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Vaccine not found',
      error: 'VACCINE_NOT_FOUND',
    })
  }
}

export class VaccineAlreadyExistsException extends ConflictException {
  constructor() {
    super({
      message: 'A vaccine with this name already exists',
      error: 'VACCINE_ALREADY_EXISTS',
    })
  }
}
