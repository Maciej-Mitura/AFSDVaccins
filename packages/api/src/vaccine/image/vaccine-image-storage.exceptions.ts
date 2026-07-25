import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'

/**
 * Domain errors for vaccine image object storage.
 * Messages never include connection strings, account keys, or SAS query strings.
 */

export class VaccineImageStorageConfigurationException extends BadRequestException {
  constructor(message: string) {
    super({
      message,
      error: 'VACCINE_IMAGE_STORAGE_CONFIGURATION_INVALID',
    })
  }
}

export class VaccineImageStorageKeyInvalidException extends BadRequestException {
  constructor() {
    super({
      message: 'Vaccine image storage key is invalid',
      error: 'VACCINE_IMAGE_STORAGE_KEY_INVALID',
    })
  }
}

export class VaccineImageBlobNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Vaccine image blob not found',
      error: 'VACCINE_IMAGE_BLOB_NOT_FOUND',
    })
  }
}

export class VaccineImageBlobAlreadyExistsException extends ConflictException {
  constructor() {
    super({
      message: 'Vaccine image blob already exists',
      error: 'VACCINE_IMAGE_BLOB_ALREADY_EXISTS',
    })
  }
}

export class VaccineImageStoragePermissionDeniedException extends ForbiddenException {
  constructor() {
    super({
      message: 'Vaccine image storage permission denied',
      error: 'VACCINE_IMAGE_STORAGE_PERMISSION_DENIED',
    })
  }
}

export class VaccineImageStorageUnavailableException extends ServiceUnavailableException {
  constructor() {
    super({
      message: 'Vaccine image storage is temporarily unavailable',
      error: 'VACCINE_IMAGE_STORAGE_UNAVAILABLE',
    })
  }
}

export class VaccineImageStorageOperationException extends BadRequestException {
  constructor(message = 'Vaccine image storage operation failed') {
    super({
      message,
      error: 'VACCINE_IMAGE_STORAGE_OPERATION_FAILED',
    })
  }
}
