import { translate } from '@/i18n/translate'

export type DeliveryArrivalRestErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'DELIVERY_ARRIVAL_ROUTE_NOT_FOUND'
  | 'DELIVERY_ARRIVAL_STOP_NOT_FOUND'
  | 'DELIVERY_ARRIVAL_FORBIDDEN'
  | 'DELIVERY_ARRIVAL_ROUTE_NOT_STARTED'
  | 'DELIVERY_ARRIVAL_ROUTE_INACTIVE'
  | 'DELIVERY_ARRIVAL_STOP_ALREADY_DELIVERED'
  | 'DELIVERY_ARRIVAL_ALREADY_RECORDED'
  | 'DELIVERY_ARRIVAL_TIMESTAMP_INVALID'
  | 'DELIVERY_ARRIVAL_CONFLICT'
  | 'DELIVERY_ARRIVAL_FAILED'
  | 'UNKNOWN'

export class DeliveryArrivalRestError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message?: string) {
    super(message ?? code)
    this.name = 'DeliveryArrivalRestError'
    this.status = status
    this.code = code
  }
}

const STATUS_CODE_FALLBACKS: Record<number, DeliveryArrivalRestErrorCode> = {
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  429: 'RATE_LIMITED',
}

const ERROR_CODE_KEYS: Record<string, string> = {
  UNAUTHENTICATED: 'errors.deliveryArrival.unauthorized',
  FORBIDDEN: 'errors.deliveryArrival.forbidden',
  RATE_LIMITED: 'errors.deliveryArrival.rateLimited',
  NETWORK_ERROR: 'errors.deliveryArrival.network',
  DELIVERY_ARRIVAL_ROUTE_NOT_FOUND: 'errors.deliveryArrival.routeNotFound',
  DELIVERY_ARRIVAL_STOP_NOT_FOUND: 'errors.deliveryArrival.stopNotFound',
  DELIVERY_ARRIVAL_FORBIDDEN: 'errors.deliveryArrival.forbidden',
  DELIVERY_ARRIVAL_ROUTE_NOT_STARTED: 'errors.deliveryArrival.routeNotStarted',
  DELIVERY_ARRIVAL_ROUTE_INACTIVE: 'errors.deliveryArrival.routeInactive',
  DELIVERY_ARRIVAL_STOP_ALREADY_DELIVERED:
    'errors.deliveryArrival.stopAlreadyDelivered',
  DELIVERY_ARRIVAL_ALREADY_RECORDED: 'errors.deliveryArrival.alreadyRecorded',
  DELIVERY_ARRIVAL_TIMESTAMP_INVALID: 'errors.deliveryArrival.timestampInvalid',
  DELIVERY_ARRIVAL_CONFLICT: 'errors.deliveryArrival.conflict',
  DELIVERY_ARRIVAL_FAILED: 'errors.deliveryArrival.failed',
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

export function parseDeliveryArrivalRestErrorBody(
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

export function mapDeliveryArrivalRestError(error: unknown): string {
  if (error instanceof DeliveryArrivalRestError) {
    return mapDeliveryArrivalErrorCode(error.code, error.status)
  }

  return translate('errors.deliveryArrival.network')
}

export function mapDeliveryArrivalErrorCode(
  code: string,
  status?: number,
): string {
  const key = ERROR_CODE_KEYS[code]
  if (key) {
    return translate(key)
  }

  if (status != null) {
    const statusFallback = STATUS_CODE_FALLBACKS[status]
    if (statusFallback && ERROR_CODE_KEYS[statusFallback]) {
      return translate(ERROR_CODE_KEYS[statusFallback])
    }
  }

  return translate('errors.deliveryArrival.generic')
}

/** Transient failures that may be retried automatically. */
export function isDeliveryArrivalTransientError(code: string): boolean {
  return (
    code === 'NETWORK_ERROR' ||
    code === 'RATE_LIMITED' ||
    code === 'DELIVERY_ARRIVAL_FAILED' ||
    code === 'UNKNOWN'
  )
}

/** Domain/permanent conflicts — do not auto-retry; server wins. */
export function isDeliveryArrivalDomainConflict(code: string): boolean {
  return (
    code === 'DELIVERY_ARRIVAL_ROUTE_NOT_FOUND' ||
    code === 'DELIVERY_ARRIVAL_STOP_NOT_FOUND' ||
    code === 'DELIVERY_ARRIVAL_FORBIDDEN' ||
    code === 'DELIVERY_ARRIVAL_ROUTE_NOT_STARTED' ||
    code === 'DELIVERY_ARRIVAL_ROUTE_INACTIVE' ||
    code === 'DELIVERY_ARRIVAL_STOP_ALREADY_DELIVERED' ||
    code === 'DELIVERY_ARRIVAL_ALREADY_RECORDED' ||
    code === 'DELIVERY_ARRIVAL_TIMESTAMP_INVALID' ||
    code === 'DELIVERY_ARRIVAL_CONFLICT' ||
    code === 'UNAUTHENTICATED' ||
    code === 'FORBIDDEN'
  )
}

/**
 * Codes that mean local pending arrival is obsolete and should be dropped
 * after refreshing authoritative route state (same-key already recorded is success).
 */
export function isDeliveryArrivalObsoleteConflict(code: string): boolean {
  return (
    code === 'DELIVERY_ARRIVAL_STOP_ALREADY_DELIVERED' ||
    code === 'DELIVERY_ARRIVAL_ALREADY_RECORDED' ||
    code === 'DELIVERY_ARRIVAL_ROUTE_INACTIVE' ||
    code === 'DELIVERY_ARRIVAL_ROUTE_NOT_FOUND' ||
    code === 'DELIVERY_ARRIVAL_STOP_NOT_FOUND' ||
    code === 'DELIVERY_ARRIVAL_FORBIDDEN'
  )
}
