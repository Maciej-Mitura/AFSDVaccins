import { BadRequestException } from '@nestjs/common'

export class FirebaseEmailMissingException extends BadRequestException {
  constructor() {
    super({
      message: 'Verified Firebase identity has no email address',
      error: 'FIREBASE_EMAIL_MISSING',
    })
  }
}
