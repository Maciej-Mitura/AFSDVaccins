import { translate } from '@/i18n/translate'

export type DeliveryQrRestErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'DELIVERY_QR_TOKEN_REQUIRED'
  | 'DELIVERY_QR_TOKEN_INVALID'
  | 'DELIVERY_QR_VERSION_UNSUPPORTED'
  | 'DELIVERY_QR_ROUTE_NOT_FOUND'
  | 'DELIVERY_QR_FORBIDDEN'
  | 'DELIVERY_QR_ROUTE_NOT_STARTED'
  | 'DELIVERY_QR_ROUTE_INACTIVE'
  | 'DELIVERY_QR_STOP_NOT_FOUND'
  | 'DELIVERY_QR_CONSUMED'
  | 'DELIVERY_QR_STOP_ALREADY_DELIVERED'
  | 'DELIVERY_QR_ORDER_INTEGRITY_ERROR'
  | 'DELIVERY_QR_CONFIRMATION_IN_PROGRESS'
  | 'DELIVERY_QR_CONFIRMATION_CONFLICT'
  | 'DELIVERY_QR_CONFIRMATION_FAILED'
  | 'UNKNOWN'

export class DeliveryQrRestError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message?: string) {
    super(message ?? code)
    this.name = 'DeliveryQrRestError'
    this.status = status
    this.code = code
  }
}

const STATUS_CODE_FALLBACKS: Record<number, DeliveryQrRestErrorCode> = {
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  429: 'RATE_LIMITED',
}

const ERROR_CODE_KEYS: Record<string, string> = {
  UNAUTHENTICATED: 'errors.deliveryQr.unauthorized',
  FORBIDDEN: 'errors.deliveryQr.forbidden',
  RATE_LIMITED: 'errors.deliveryQr.rateLimited',
  NETWORK_ERROR: 'errors.deliveryQr.network',
  DELIVERY_QR_TOKEN_REQUIRED: 'errors.deliveryQr.tokenRequired',
  DELIVERY_QR_TOKEN_INVALID: 'errors.deliveryQr.tokenInvalid',
  DELIVERY_QR_VERSION_UNSUPPORTED: 'errors.deliveryQr.versionUnsupported',
  DELIVERY_QR_ROUTE_NOT_FOUND: 'errors.deliveryQr.routeNotFound',
  DELIVERY_QR_FORBIDDEN: 'errors.deliveryQr.wrongCourier',
  DELIVERY_QR_ROUTE_NOT_STARTED: 'errors.deliveryQr.routeNotStarted',
  DELIVERY_QR_ROUTE_INACTIVE: 'errors.deliveryQr.routeInactive',
  DELIVERY_QR_STOP_NOT_FOUND: 'errors.deliveryQr.stopNotFound',
  DELIVERY_QR_CONSUMED: 'errors.deliveryQr.consumed',
  DELIVERY_QR_STOP_ALREADY_DELIVERED: 'errors.deliveryQr.alreadyDelivered',
  DELIVERY_QR_ORDER_INTEGRITY_ERROR: 'errors.deliveryQr.integrity',
  DELIVERY_QR_CONFIRMATION_IN_PROGRESS:
    'errors.deliveryQr.confirmationInProgress',
  DELIVERY_QR_CONFIRMATION_CONFLICT: 'errors.deliveryQr.confirmationConflict',
  DELIVERY_QR_CONFIRMATION_FAILED: 'errors.deliveryQr.confirmationFailed',
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
 * Normalize Nest/throttle JSON bodies into a stable status + code pair.
 * Never logs QR tokens or includes them in messages.
 */
export function parseDeliveryQrRestErrorBody(
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
    if (error instanceof DeliveryQrRestError) {
      console.error('[delivery-qr-rest]', {
        status: error.status,
        code: error.code,
      })
      return
    }
    console.error('[delivery-qr-rest]', error)
  }
}

/** Map REST failures to translated user-facing messages (never includes token). */
export function mapDeliveryQrRestError(error: unknown): string {
  if (error instanceof DeliveryQrRestError) {
    const key = ERROR_CODE_KEYS[error.code]
    if (key) {
      return translate(key)
    }

    const statusFallback = STATUS_CODE_FALLBACKS[error.status]
    if (statusFallback && ERROR_CODE_KEYS[statusFallback]) {
      return translate(ERROR_CODE_KEYS[statusFallback])
    }

    logTechnicalError(error)
    return translate('errors.deliveryQr.generic')
  }

  logTechnicalError(error)
  return translate('errors.deliveryQr.network')
}

/** Codes that should refresh route state and clear the transient token. */
export function isDeliveryQrStaleTokenError(code: string): boolean {
  return (
    code === 'DELIVERY_QR_CONSUMED' ||
    code === 'DELIVERY_QR_STOP_ALREADY_DELIVERED'
  )
}

/** Codes that close confirmation and refresh the route. */
export function isDeliveryQrRouteClosedError(code: string): boolean {
  return (
    code === 'DELIVERY_QR_ROUTE_INACTIVE' ||
    code === 'DELIVERY_QR_ROUTE_NOT_STARTED'
  )
}

/** Integrity errors must not retry confirmation without a fresh scan. */
export function isDeliveryQrIntegrityError(code: string): boolean {
  return code === 'DELIVERY_QR_ORDER_INTEGRITY_ERROR'
}

export function isDeliveryQrConfirmationInProgress(code: string): boolean {
  return code === 'DELIVERY_QR_CONFIRMATION_IN_PROGRESS'
}
