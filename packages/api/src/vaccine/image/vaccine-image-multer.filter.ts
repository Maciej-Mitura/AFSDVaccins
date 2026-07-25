import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common'
import { Response } from 'express'
import { MulterError } from 'multer'

import { VACCINE_IMAGE_MAX_BYTES } from './vaccine-image-upload.exceptions'

@Catch(MulterError)
export class VaccineImageMulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>()

    if (exception.code === 'LIMIT_FILE_SIZE') {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Vaccine image must be at most ${VACCINE_IMAGE_MAX_BYTES} bytes`,
        error: 'INVALID_VACCINE_IMAGE',
      })
      return
    }

    if (
      exception.code === 'LIMIT_UNEXPECTED_FILE' ||
      exception.code === 'LIMIT_FILE_COUNT'
    ) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Only a single multipart file field named "image" is allowed',
        error: 'INVALID_VACCINE_IMAGE',
      })
      return
    }

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Vaccine image upload is invalid',
      error: 'INVALID_VACCINE_IMAGE',
    })
  }
}
