import { NotFoundException } from '@nestjs/common'

export class NotificationNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Melding niet gevonden.',
      error: 'NOTIFICATION_NOT_FOUND',
    })
  }
}
