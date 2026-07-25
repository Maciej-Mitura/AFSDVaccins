import { translate } from '@/i18n/translate'

export type VaccineImageRestErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'VACCINE_IMAGE_FILE_REQUIRED'
  | 'INVALID_VACCINE_IMAGE'
  | 'VACCINE_IMAGE_CONCURRENT_MODIFICATION'
  | 'VACCINE_IMAGE_NOT_PRESENT'
  | 'VACCINE_IMAGE_OVERRIDE_REASON_INVALID'
  | 'VACCINE_NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'UNPROCESSABLE_ENTITY'
  | 'UNKNOWN'

export class VaccineImageRestError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message?: string) {
    super(message ?? code)
    this.name = 'VaccineImageRestError'
    this.status = status
    this.code = code
  }
}

const STATUS_CODE_FALLBACKS: Record<number, VaccineImageRestErrorCode> = {
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMITED',
}

const ERROR_CODE_KEYS: Record<string, string> = {
  UNAUTHENTICATED: 'errors.vaccineImage.unauthorized',
  FORBIDDEN: 'errors.vaccineImage.forbidden',
  RATE_LIMITED: 'errors.vaccineImage.rateLimited',
  NETWORK_ERROR: 'errors.vaccineImage.network',
  VACCINE_IMAGE_FILE_REQUIRED: 'errors.vaccineImage.fileRequired',
  INVALID_VACCINE_IMAGE: 'errors.vaccineImage.invalid',
  VACCINE_IMAGE_CONCURRENT_MODIFICATION: 'errors.vaccineImage.concurrent',
  VACCINE_IMAGE_NOT_PRESENT: 'errors.vaccineImage.notPresent',
  VACCINE_IMAGE_OVERRIDE_REASON_INVALID: 'errors.vaccineImage.overrideReason',
  VACCINE_NOT_FOUND: 'errors.vaccineImage.notFound',
  PAYLOAD_TOO_LARGE: 'errors.vaccineImage.tooLarge',
  UNSUPPORTED_MEDIA_TYPE: 'errors.vaccineImage.unsupportedType',
  UNPROCESSABLE_ENTITY: 'errors.vaccineImage.invalid',
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function readErrorCode(body: unknown): string | null {
  const record = asRecord(body)
  if (!record) {
    return null
  }

  if (typeof record.error === 'string' && record.error.length > 0) {
    return record.error
  }

  const original = asRecord(record.originalError)
  if (original && typeof original.error === 'string') {
    return original.error
  }

  return null
}

/**
 * Normalize Nest/Multer/throttle JSON bodies into a stable status + code pair.
 * Never logs bearer tokens or image bytes.
 */
export function parseVaccineImageRestErrorBody(
  body: unknown,
  status: number,
): { status: number; code: string; message?: string } {
  const codeFromBody = readErrorCode(body)
  const code =
    codeFromBody ??
    STATUS_CODE_FALLBACKS[status] ??
    (status === 0 ? 'NETWORK_ERROR' : 'UNKNOWN')

  const record = asRecord(body)
  const message =
    typeof record?.message === 'string' ? record.message : undefined

  return { status, code, message }
}

function logTechnicalError(error: unknown): void {
  if (import.meta.env.DEV) {
    if (error instanceof VaccineImageRestError) {
      console.error('[vaccine-image-rest]', {
        status: error.status,
        code: error.code,
      })
      return
    }
    console.error('[vaccine-image-rest]', error)
  }
}

/** Map REST failures to translated user-facing messages. */
export function mapVaccineImageRestError(error: unknown): string {
  if (error instanceof VaccineImageRestError) {
    const key = ERROR_CODE_KEYS[error.code]
    if (key) {
      return translate(key)
    }

    const statusFallback = STATUS_CODE_FALLBACKS[error.status]
    if (statusFallback && ERROR_CODE_KEYS[statusFallback]) {
      return translate(ERROR_CODE_KEYS[statusFallback])
    }

    logTechnicalError(error)
    return translate('errors.vaccineImage.generic')
  }

  logTechnicalError(error)
  return translate('errors.vaccineImage.network')
}
