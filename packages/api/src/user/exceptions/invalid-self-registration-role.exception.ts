import { BadRequestException } from '@nestjs/common'

export class InvalidSelfRegistrationRoleException extends BadRequestException {
  constructor() {
    super({
      message: 'Deze accountrol is niet beschikbaar voor zelfregistratie.',
      error: 'INVALID_SELF_REGISTRATION_ROLE',
    })
  }
}
