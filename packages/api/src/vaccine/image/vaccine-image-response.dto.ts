import { VaccineImageValidationStatus } from './vaccine-image-validation-status.enum'
import { isVaccineImageBrowseable } from './vaccine-image.browseable'
import { VaccineImage } from './vaccine-image.embed'

/**
 * Safe REST/GraphQL-aligned image payload.
 * Never includes storageKey, storageProvider, sizeBytes, OCR, or adminOverride.
 */
export type VaccineImageSafeDto = {
  originalFilename: string
  mimeType: string
  width: number
  height: number
  validationStatus: VaccineImageValidationStatus
  aiCaption: string | null
  aiConfidence: number | null
  aiTags: string[]
  aiReason: string | null
  uploadedAt: string
  imageUrl: string | null
}

export type VaccineImageUploadResponseDto = {
  vaccineId: string
  image: VaccineImageSafeDto
}

export type VaccineImageDeleteResponseDto = {
  vaccineId: string
  /** false when no image existed (idempotent success). */
  deleted: boolean
}

export type VaccineImageOverrideResponseDto = {
  vaccineId: string
  image: VaccineImageSafeDto
}

export function toVaccineImageSafeDto(
  image: VaccineImage,
  imageUrl: string | null,
): VaccineImageSafeDto {
  return {
    originalFilename: image.originalFilename,
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
    validationStatus: image.validationStatus,
    aiCaption: image.aiCaption ?? null,
    aiConfidence:
      typeof image.aiConfidence === 'number' ? image.aiConfidence : null,
    aiTags: [...(image.aiTags ?? [])],
    aiReason: image.aiReason ?? null,
    uploadedAt: image.uploadedAt.toISOString(),
    imageUrl: isVaccineImageBrowseable(image.validationStatus) ? imageUrl : null,
  }
}
