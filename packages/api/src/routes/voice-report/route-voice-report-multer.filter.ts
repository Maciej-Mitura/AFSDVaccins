import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common'
import { Response } from 'express'
import { MulterError } from 'multer'

import { ROUTE_VOICE_REPORT_MAX_AUDIO_BYTES } from './route-voice-report.constants'

@Catch(MulterError)
export class RouteVoiceReportMulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>()

    if (exception.code === 'LIMIT_FILE_SIZE') {
      response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        message: `Audio must be at most ${ROUTE_VOICE_REPORT_MAX_AUDIO_BYTES} bytes`,
        error: 'ROUTE_VOICE_REPORT_AUDIO_TOO_LARGE',
      })
      return
    }

    if (
      exception.code === 'LIMIT_UNEXPECTED_FILE' ||
      exception.code === 'LIMIT_FILE_COUNT'
    ) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Only a single multipart file field named "audio" is allowed',
        error: 'ROUTE_VOICE_REPORT_AUDIO_REQUIRED',
      })
      return
    }

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Voice report upload is invalid',
      error: 'ROUTE_VOICE_REPORT_CREATION_FAILED',
    })
  }
}
