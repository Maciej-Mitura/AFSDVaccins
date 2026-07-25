import {
  VACCINE_IMAGE_ACCEPTED_MIME_TYPES,
  VACCINE_IMAGE_MAX_BYTES,
  type VaccineImageAcceptedMimeType,
} from '@/api/vaccine-image-rest'
import { translate } from '@/i18n/translate'

export type VaccineImageClientValidationCode =
  'NO_FILE' | 'UNSUPPORTED_TYPE' | 'TOO_LARGE'

export type VaccineImageClientValidationResult =
  | { ok: true; file: File }
  | { ok: false; code: VaccineImageClientValidationCode; message: string }

export function isAcceptedVaccineImageMime(
  mimeType: string,
): mimeType is VaccineImageAcceptedMimeType {
  return (VACCINE_IMAGE_ACCEPTED_MIME_TYPES as readonly string[]).includes(
    mimeType,
  )
}

/**
 * Immediate client-side checks only — backend remains authoritative.
 */
export function validateVaccineImageFile(
  file: File | null | undefined,
): VaccineImageClientValidationResult {
  if (!file) {
    return {
      ok: false,
      code: 'NO_FILE',
      message: translate('validation.image.required'),
    }
  }

  if (!isAcceptedVaccineImageMime(file.type)) {
    return {
      ok: false,
      code: 'UNSUPPORTED_TYPE',
      message: translate('validation.image.unsupportedType'),
    }
  }

  if (file.size > VACCINE_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      code: 'TOO_LARGE',
      message: translate('validation.image.tooLarge'),
    }
  }

  return { ok: true, file }
}

export function formatVaccineImageFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export type VaccineImagePreviewState = {
  file: File | null
  objectUrl: string | null
}

/**
 * Manage a single object-URL preview. Always revoke previous URLs.
 */
export function createVaccineImagePreviewController() {
  let objectUrl: string | null = null

  function revoke(): void {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      objectUrl = null
    }
  }

  function select(file: File): string {
    revoke()
    objectUrl = URL.createObjectURL(file)
    return objectUrl
  }

  function current(): string | null {
    return objectUrl
  }

  return { select, revoke, current }
}
