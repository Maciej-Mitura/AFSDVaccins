import { BadRequestException } from '@nestjs/common'

export class SettingsInvalidException extends BadRequestException {
  constructor(message: string) {
    super({
      message,
      error: 'SETTINGS_INVALID',
    })
  }
}
