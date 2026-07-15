import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'

export class VaccineNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Vaccine not found',
      error: 'VACCINE_NOT_FOUND',
    })
  }
}

export class InvalidStockAdjustmentException extends BadRequestException {
  constructor(message = 'Invalid stock adjustment') {
    super({
      message,
      error: 'INVALID_STOCK_ADJUSTMENT',
    })
  }
}

export class InsufficientStockException extends BadRequestException {
  constructor() {
    super({
      message: 'Insufficient stock for this adjustment',
      error: 'INSUFFICIENT_STOCK',
    })
  }
}

export class StockAdjustmentNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Stock adjustment not found',
      error: 'STOCK_ADJUSTMENT_NOT_FOUND',
    })
  }
}

export class StockForbiddenException extends ForbiddenException {
  constructor() {
    super({
      message: 'Forbidden',
      error: 'FORBIDDEN',
    })
  }
}
