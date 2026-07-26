import { translate } from '@/i18n/translate'
import {
  DeliveryQrRestError,
  parseDeliveryQrRestErrorBody,
} from '@/api/delivery-qr-errors'

/**
 * Display-QR error codes (pharmacy/admin SVG retrieval).
 * Separate from courier scan copy so FORBIDDEN is not “wrong courier”.
 */
export type DeliveryStopQrDisplayErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'DELIVERY_QR_NOT_FOUND'
  | 'DELIVERY_QR_NOT_AVAILABLE'
  | 'DELIVERY_QR_CONSUMED'
  | 'DELIVERY_QR_ROUTE_INACTIVE'
  | 'DELIVERY_QR_FORBIDDEN'
  | 'DELIVERY_QR_INVALID_STATE'
  | 'UNKNOWN'

const STATUS_CODE_FALLBACKS: Record<number, DeliveryStopQrDisplayErrorCode> = {
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  429: 'RATE_LIMITED',
}

const ERROR_CODE_KEYS: Record<string, string> = {
  UNAUTHENTICATED: 'errors.deliveryStopQr.unauthorized',
  FORBIDDEN: 'errors.deliveryStopQr.forbidden',
  RATE_LIMITED: 'errors.deliveryStopQr.rateLimited',
  NETWORK_ERROR: 'errors.deliveryStopQr.network',
  DELIVERY_QR_NOT_FOUND: 'errors.deliveryStopQr.notFound',
  DELIVERY_QR_NOT_AVAILABLE: 'errors.deliveryStopQr.notAvailable',
  DELIVERY_QR_CONSUMED: 'errors.deliveryStopQr.consumed',
  DELIVERY_QR_ROUTE_INACTIVE: 'errors.deliveryStopQr.routeInactive',
  DELIVERY_QR_FORBIDDEN: 'errors.deliveryStopQr.forbidden',
  DELIVERY_QR_INVALID_STATE: 'errors.deliveryStopQr.invalidState',
}

function logTechnicalError(error: unknown): void {
  if (import.meta.env.DEV) {
    if (error instanceof DeliveryQrRestError) {
      console.error('[delivery-stop-qr-display]', {
        status: error.status,
        code: error.code,
      })
      return
    }
    console.error('[delivery-stop-qr-display]', error)
  }
}

/** Map display-QR REST/GraphQL failures to precise translated messages. */
export function mapDeliveryStopQrDisplayError(error: unknown): string {
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
    return translate('errors.deliveryStopQr.unableToLoad')
  }

  // GraphQL Apollo errors may carry the Nest `error` code in extensions/body.
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') {
      for (const code of Object.keys(ERROR_CODE_KEYS)) {
        if (message.includes(code)) {
          const key = ERROR_CODE_KEYS[code]
          if (key) {
            return translate(key)
          }
        }
      }
    }

    const graphQLErrors = (error as { graphQLErrors?: unknown[] }).graphQLErrors
    if (Array.isArray(graphQLErrors)) {
      for (const gqlError of graphQLErrors) {
        const extensions =
          typeof gqlError === 'object' && gqlError !== null
            ? (gqlError as { extensions?: Record<string, unknown> }).extensions
            : undefined
        const original = extensions?.originalError
        const parsed = parseDeliveryQrRestErrorBody(
          typeof original === 'object' ? original : extensions,
          400,
        )
        const key = ERROR_CODE_KEYS[parsed.code]
        if (key) {
          return translate(key)
        }
      }
    }
  }

  logTechnicalError(error)
  return translate('errors.deliveryStopQr.unableToLoad')
}

export function isDeliveryStopQrInactiveError(code: string): boolean {
  return (
    code === 'DELIVERY_QR_CONSUMED' ||
    code === 'DELIVERY_QR_ROUTE_INACTIVE' ||
    code === 'DELIVERY_QR_NOT_AVAILABLE' ||
    code === 'DELIVERY_QR_NOT_FOUND' ||
    code === 'DELIVERY_QR_INVALID_STATE'
  )
}
