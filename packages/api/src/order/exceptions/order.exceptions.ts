import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'

export class OrderNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Bestelling niet gevonden.',
      error: 'ORDER_NOT_FOUND',
    })
  }
}

export class OrderNotOwnedException extends NotFoundException {
  constructor() {
    super({
      message: 'Bestelling niet gevonden.',
      error: 'ORDER_NOT_FOUND',
    })
  }
}

export class OrderCannotBeCancelledException extends BadRequestException {
  constructor() {
    super({
      message: 'Deze bestelling kan niet meer geannuleerd worden.',
      error: 'ORDER_CANNOT_BE_CANCELLED',
    })
  }
}

export class InvalidOrderQuantityException extends BadRequestException {
  constructor() {
    super({
      message: 'Elke bestelregel moet een positief geheel getal bevatten.',
      error: 'INVALID_ORDER_QUANTITY',
    })
  }
}

export class WeeklyLimitExceededException extends BadRequestException {
  constructor(weeklyLimit: number) {
    super({
      message: `Het weekmaximum van ${weeklyLimit} dosissen is overschreden.`,
      error: 'WEEKLY_LIMIT_EXCEEDED',
      weeklyLimit,
    })
  }
}

export class DailyLimitExceededException extends BadRequestException {
  constructor(vaccineName: string, dailyLimit: number) {
    super({
      message: `Het dagmaximum van ${dailyLimit} dosissen voor ${vaccineName} is overschreden.`,
      error: 'DAILY_LIMIT_EXCEEDED',
      vaccineName,
      dailyLimit,
    })
  }
}

export class OrderForbiddenException extends ForbiddenException {
  constructor() {
    super({
      message: 'Je hebt geen toegang tot deze operatie.',
      error: 'FORBIDDEN',
    })
  }
}

export class InvalidOrderStatusTransitionException extends BadRequestException {
  constructor(fromStatus: string, toStatus: string) {
    super({
      message: `Statusovergang van ${fromStatus} naar ${toStatus} is niet toegestaan.`,
      error: 'INVALID_ORDER_STATUS_TRANSITION',
      fromStatus,
      toStatus,
    })
  }
}
