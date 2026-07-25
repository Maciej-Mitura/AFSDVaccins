import { BadRequestException, ConflictException } from '@nestjs/common'

import { InvalidVaccineImageException } from './vaccine-image.validation'

/** Max upload size (bytes) — Multer + domain validation. */
export const VACCINE_IMAGE_MAX_BYTES = 5 * 1024 * 1024

export const VACCINE_IMAGE_MIN_DIMENSION = 200
export const VACCINE_IMAGE_MAX_DIMENSION = 6000

export const VACCINE_IMAGE_OVERRIDE_REASON_MAX_LENGTH = 500
export const VACCINE_IMAGE_DISPLAY_FILENAME_MAX_LENGTH = 120

export type VaccineImageValidatedFormat = 'jpeg' | 'png' | 'webp'

export type VaccineImageValidatedFile = {
  bytes: Buffer
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  format: VaccineImageValidatedFormat
  extension: 'jpg' | 'png' | 'webp'
  width: number
  height: number
  sizeBytes: number
  /** Safe display-only filename; never used as storage path. */
  displayFilename: string
}

export class VaccineImageMissingFileException extends BadRequestException {
  constructor() {
    super({
      message: 'Vaccine image file is required (multipart field "image")',
      error: 'VACCINE_IMAGE_FILE_REQUIRED',
    })
  }
}

export class VaccineImageConcurrentModificationException extends ConflictException {
  constructor() {
    super({
      message:
        'Vaccine image was modified concurrently; retry the upload or delete',
      error: 'VACCINE_IMAGE_CONCURRENT_MODIFICATION',
    })
  }
}

export class VaccineImageNotPresentException extends BadRequestException {
  constructor() {
    super({
      message: 'Vaccine has no image to override',
      error: 'VACCINE_IMAGE_NOT_PRESENT',
    })
  }
}

export class VaccineImageOverrideReasonException extends BadRequestException {
  constructor(message: string) {
    super({
      message,
      error: 'VACCINE_IMAGE_OVERRIDE_REASON_INVALID',
    })
  }
}

export { InvalidVaccineImageException }
