import { BadRequestException } from '@nestjs/common'

import { VaccineImageAdminOverride } from './vaccine-image-admin-override.embed'
import { VaccineImageAiProvider } from './vaccine-image-ai-provider.enum'
import { VaccineImageOverrideDecision } from './vaccine-image-override-decision.enum'
import { VaccineImageStorageProviderId } from './vaccine-image-storage-provider.enum'
import { VaccineImageValidationStatus } from './vaccine-image-validation-status.enum'
import { VaccineImage } from './vaccine-image.embed'

export class InvalidVaccineImageException extends BadRequestException {
  constructor(message: string) {
    super({
      message,
      error: 'INVALID_VACCINE_IMAGE',
    })
  }
}

const VALIDATION_STATUSES = new Set<string>(
  Object.values(VaccineImageValidationStatus),
)
const AI_PROVIDERS = new Set<string>(Object.values(VaccineImageAiProvider))
const STORAGE_PROVIDERS = new Set<string>(
  Object.values(VaccineImageStorageProviderId),
)
const OVERRIDE_DECISIONS = new Set<string>(
  Object.values(VaccineImageOverrideDecision),
)

function assertPositiveInteger(value: unknown, field: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value)
  ) {
    throw new InvalidVaccineImageException(`${field} must be a positive integer`)
  }
  if (value <= 0) {
    throw new InvalidVaccineImageException(`${field} must be a positive integer`)
  }
  return value
}

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidVaccineImageException(`${field} must be a non-empty string`)
  }
  return value
}

function assertStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new InvalidVaccineImageException(`${field} must be an array of strings`)
  }
  const items: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new InvalidVaccineImageException(
        `${field} must be an array of strings`,
      )
    }
    items.push(item)
  }
  return items
}

function assertOptionalConfidence(value: unknown): number | null | undefined {
  if (value === undefined || value === null) {
    return value
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidVaccineImageException(
      'aiConfidence must be a finite number between 0 and 1',
    )
  }
  if (value < 0 || value > 1) {
    throw new InvalidVaccineImageException(
      'aiConfidence must be between 0 and 1',
    )
  }
  return value
}

function assertAdminOverride(
  override: VaccineImageAdminOverride | null | undefined,
): void {
  if (override === undefined || override === null) {
    return
  }

  if (!OVERRIDE_DECISIONS.has(override.decision)) {
    throw new InvalidVaccineImageException(
      'adminOverride.decision must be a valid VaccineImageOverrideDecision',
    )
  }

  assertNonEmptyString(override.reason, 'adminOverride.reason')
  assertNonEmptyString(
    override.overriddenByUserId,
    'adminOverride.overriddenByUserId',
  )

  if (
    !(override.overriddenAt instanceof Date) ||
    Number.isNaN(override.overriddenAt.getTime())
  ) {
    throw new InvalidVaccineImageException(
      'adminOverride.overriddenAt must be a valid Date',
    )
  }
}

/**
 * Domain invariants for persisted vaccine image metadata.
 * Does not perform upload transitions — validation of a complete metadata object only.
 */
export function assertValidVaccineImage(image: VaccineImage): VaccineImage {
  if (!STORAGE_PROVIDERS.has(image.storageProvider)) {
    throw new InvalidVaccineImageException(
      'storageProvider must be a valid VaccineImageStorageProvider',
    )
  }

  assertNonEmptyString(image.storageKey, 'storageKey')
  assertNonEmptyString(image.originalFilename, 'originalFilename')
  assertNonEmptyString(image.mimeType, 'mimeType')
  assertPositiveInteger(image.sizeBytes, 'sizeBytes')
  assertPositiveInteger(image.width, 'width')
  assertPositiveInteger(image.height, 'height')

  if (!VALIDATION_STATUSES.has(image.validationStatus)) {
    throw new InvalidVaccineImageException(
      'validationStatus must be a valid VaccineImageValidationStatus',
    )
  }

  if (!AI_PROVIDERS.has(image.aiProvider)) {
    throw new InvalidVaccineImageException(
      'aiProvider must be a valid VaccineImageAiProvider',
    )
  }

  assertOptionalConfidence(image.aiConfidence)

  image.aiTags = assertStringArray(image.aiTags ?? [], 'aiTags')
  image.aiDetectedText = assertStringArray(
    image.aiDetectedText ?? [],
    'aiDetectedText',
  )

  if (
    image.aiCaption !== undefined &&
    image.aiCaption !== null &&
    typeof image.aiCaption !== 'string'
  ) {
    throw new InvalidVaccineImageException(
      'aiCaption must be a string when present',
    )
  }

  if (
    image.aiReason !== undefined &&
    image.aiReason !== null &&
    typeof image.aiReason !== 'string'
  ) {
    throw new InvalidVaccineImageException(
      'aiReason must be a string when present',
    )
  }

  if (
    image.analysedAt !== undefined &&
    image.analysedAt !== null &&
    (!(image.analysedAt instanceof Date) ||
      Number.isNaN(image.analysedAt.getTime()))
  ) {
    throw new InvalidVaccineImageException(
      'analysedAt must be a valid Date when present',
    )
  }

  if (
    !(image.uploadedAt instanceof Date) ||
    Number.isNaN(image.uploadedAt.getTime())
  ) {
    throw new InvalidVaccineImageException('uploadedAt must be a valid Date')
  }

  assertNonEmptyString(image.uploadedByUserId, 'uploadedByUserId')
  assertAdminOverride(image.adminOverride)

  return image
}
