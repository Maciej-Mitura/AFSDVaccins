import { imageSize } from 'image-size'
import { randomUUID } from 'node:crypto'

import {
  VACCINE_IMAGE_DISPLAY_FILENAME_MAX_LENGTH,
  VACCINE_IMAGE_MAX_BYTES,
  VACCINE_IMAGE_MAX_DIMENSION,
  VACCINE_IMAGE_MIN_DIMENSION,
  VaccineImageValidatedFile,
  VaccineImageValidatedFormat,
} from './vaccine-image-upload.exceptions'
import { assertValidVaccineImageStorageKey } from './vaccine-image-storage-key'
import { InvalidVaccineImageException } from './vaccine-image.validation'

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff])
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

type DetectedMagic = {
  format: VaccineImageValidatedFormat
  mimeType: VaccineImageValidatedFile['mimeType']
  extension: VaccineImageValidatedFile['extension']
}

/**
 * Validate uploaded vaccine image bytes without trusting filename, extension,
 * or browser Content-Type. Uses magic bytes + image-size decode for dimensions.
 */
export function validateVaccineImageUpload(input: {
  bytes: Buffer
  originalFilename?: string | null
  declaredMimeType?: string | null
}): VaccineImageValidatedFile {
  if (!Buffer.isBuffer(input.bytes) || input.bytes.length === 0) {
    throw new InvalidVaccineImageException('Vaccine image file must be non-empty')
  }

  if (input.bytes.length > VACCINE_IMAGE_MAX_BYTES) {
    throw new InvalidVaccineImageException(
      `Vaccine image must be at most ${VACCINE_IMAGE_MAX_BYTES} bytes`,
    )
  }

  rejectSvgOrXml(input.bytes)

  const magic = detectMagicFormat(input.bytes)
  if (!magic) {
    throw new InvalidVaccineImageException(
      'Vaccine image must be a JPEG, PNG, or WebP file',
    )
  }

  let decoded: { width?: number; height?: number; type?: string }
  try {
    decoded = imageSize(input.bytes)
  } catch {
    throw new InvalidVaccineImageException(
      'Vaccine image is corrupt or truncated and cannot be decoded',
    )
  }

  if (
    typeof decoded.width !== 'number' ||
    typeof decoded.height !== 'number' ||
    !Number.isFinite(decoded.width) ||
    !Number.isFinite(decoded.height) ||
    decoded.width <= 0 ||
    decoded.height <= 0
  ) {
    throw new InvalidVaccineImageException(
      'Vaccine image dimensions could not be determined',
    )
  }

  const decodedType = normalizeImageSizeType(decoded.type)
  if (!decodedType || decodedType !== magic.format) {
    throw new InvalidVaccineImageException(
      'Vaccine image format does not match its file contents',
    )
  }

  if (
    decoded.width < VACCINE_IMAGE_MIN_DIMENSION ||
    decoded.height < VACCINE_IMAGE_MIN_DIMENSION
  ) {
    throw new InvalidVaccineImageException(
      `Vaccine image must be at least ${VACCINE_IMAGE_MIN_DIMENSION}x${VACCINE_IMAGE_MIN_DIMENSION} pixels`,
    )
  }

  if (
    decoded.width > VACCINE_IMAGE_MAX_DIMENSION ||
    decoded.height > VACCINE_IMAGE_MAX_DIMENSION
  ) {
    throw new InvalidVaccineImageException(
      `Vaccine image must be at most ${VACCINE_IMAGE_MAX_DIMENSION}x${VACCINE_IMAGE_MAX_DIMENSION} pixels`,
    )
  }

  const declared = (input.declaredMimeType ?? '').trim().toLowerCase()
  if (declared.length > 0 && declared !== magic.mimeType) {
    // Tolerate image/jpg alias for JPEG.
    const declaredNormalized =
      declared === 'image/jpg' ? 'image/jpeg' : declared
    if (declaredNormalized !== magic.mimeType) {
      throw new InvalidVaccineImageException(
        'Declared Content-Type does not match the validated image format',
      )
    }
  }

  return {
    bytes: input.bytes,
    mimeType: magic.mimeType,
    format: magic.format,
    extension: magic.extension,
    width: decoded.width,
    height: decoded.height,
    sizeBytes: input.bytes.length,
    displayFilename: sanitizeDisplayFilename(
      input.originalFilename,
      magic.extension,
    ),
  }
}

/**
 * Server-controlled storage key: vaccines/{vaccineId}/{uuid}.{ext}
 * Never incorporates the original filename.
 */
export function generateVaccineImageStorageKey(
  vaccineId: string,
  extension: VaccineImageValidatedFile['extension'],
): string {
  const safeVaccineId = assertSafeVaccineIdSegment(vaccineId)
  const key = `vaccines/${safeVaccineId}/${randomUUID()}.${extension}`
  return assertValidVaccineImageStorageKey(key)
}

function assertSafeVaccineIdSegment(vaccineId: string): string {
  const trimmed = vaccineId.trim()
  if (!/^[a-fA-F0-9]{24}$/.test(trimmed)) {
    throw new InvalidVaccineImageException(
      'Vaccine id is invalid for image storage key generation',
    )
  }
  return trimmed.toLowerCase()
}

function detectMagicFormat(bytes: Buffer): DetectedMagic | null {
  if (bytes.length >= 3 && bytes.subarray(0, 3).equals(JPEG_MAGIC)) {
    return { format: 'jpeg', mimeType: 'image/jpeg', extension: 'jpg' }
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_MAGIC)) {
    return { format: 'png', mimeType: 'image/png', extension: 'png' }
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { format: 'webp', mimeType: 'image/webp', extension: 'webp' }
  }
  return null
}

function rejectSvgOrXml(bytes: Buffer): void {
  const head = bytes
    .subarray(0, Math.min(bytes.length, 256))
    .toString('utf8')
    .trimStart()
    .toLowerCase()
  if (
    head.startsWith('<?xml') ||
    head.startsWith('<svg') ||
    head.startsWith('<!doctype svg')
  ) {
    throw new InvalidVaccineImageException(
      'SVG and XML images are not allowed',
    )
  }
}

function normalizeImageSizeType(
  type: string | undefined,
): VaccineImageValidatedFormat | null {
  if (type === 'jpg' || type === 'jpeg') {
    return 'jpeg'
  }
  if (type === 'png') {
    return 'png'
  }
  if (type === 'webp') {
    return 'webp'
  }
  return null
}

export function sanitizeDisplayFilename(
  originalFilename: string | null | undefined,
  extension: VaccineImageValidatedFile['extension'],
): string {
  const fallback = `image.${extension}`
  if (typeof originalFilename !== 'string' || originalFilename.trim().length === 0) {
    return fallback
  }

  const base =
    originalFilename.replace(/\\/g, '/').split('/').pop()?.trim() ?? fallback
  const cleaned = base
    .replace(/[^\w.\-+() ]+/g, '_')
    .slice(0, VACCINE_IMAGE_DISPLAY_FILENAME_MAX_LENGTH)
    .trim()

  return cleaned.length > 0 ? cleaned : fallback
}
