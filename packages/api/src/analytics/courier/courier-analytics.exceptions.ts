import {
  ForbiddenException,
  InternalServerErrorException,
  PayloadTooLargeException,
} from '@nestjs/common'

/**
 * Phase 32A courier analytics errors — stable `error` codes only.
 * Never include Firebase UIDs, tokens, secrets, or raw Mongo documents.
 */

export class CourierAnalyticsForbiddenException extends ForbiddenException {
  constructor() {
    super({
      message: 'You do not have access to courier performance analytics.',
      error: 'COURIER_ANALYTICS_FORBIDDEN',
    })
  }
}

export class CourierAnalyticsGenerationFailedException extends InternalServerErrorException {
  constructor() {
    super({
      message: 'Courier performance analytics generation failed.',
      error: 'COURIER_ANALYTICS_GENERATION_FAILED',
    })
  }
}

export class CourierAnalyticsExportFailedException extends InternalServerErrorException {
  constructor() {
    super({
      message: 'Courier performance analytics CSV export failed.',
      error: 'COURIER_ANALYTICS_EXPORT_FAILED',
    })
  }
}

export class CourierAnalyticsTooLargeException extends PayloadTooLargeException {
  constructor() {
    super({
      message: 'Courier performance analytics dataset exceeds the allowed size.',
      error: 'COURIER_ANALYTICS_TOO_LARGE',
    })
  }
}
