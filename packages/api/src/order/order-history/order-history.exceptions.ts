import { BadRequestException } from '@nestjs/common'

export class OrderHistoryInvalidRangeException extends BadRequestException {
  constructor(message: string) {
    super({
      message,
      error: 'ORDER_HISTORY_INVALID_RANGE',
    })
  }
}

export class OrderHistoryInvalidCursorException extends BadRequestException {
  constructor() {
    super({
      message: 'Invalid order history cursor.',
      error: 'ORDER_HISTORY_INVALID_CURSOR',
    })
  }
}

export class OrderHistoryInvalidFirstException extends BadRequestException {
  constructor() {
    super({
      message: `first must be between 1 and 50.`,
      error: 'ORDER_HISTORY_INVALID_FIRST',
    })
  }
}
