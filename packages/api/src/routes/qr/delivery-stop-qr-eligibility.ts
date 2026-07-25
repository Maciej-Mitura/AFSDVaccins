import { RouteStatus } from '../route-status.enum'
import { DELIVERY_QR_TOKEN_VERSION } from './delivery-qr.constants'
import {
  DeliveryQrConsumedException,
  DeliveryQrInvalidStateException,
  DeliveryQrNotAvailableException,
  DeliveryQrRouteInactiveException,
} from './delivery-stop-qr.exceptions'
import { isStopQrConsumed } from './stop-qr-invariants'
import type { StopQrConfirmation } from './stop-qr-confirmation.embed'

export type DeliveryStopQrEligibilitySubject = {
  stopId?: string
  qrConfirmation?: StopQrConfirmation | null
}

const QR_RETRIEVAL_ACTIVE_STATUSES: ReadonlySet<RouteStatus> = new Set([
  RouteStatus.ASSIGNED,
  RouteStatus.IN_PROGRESS,
])

/**
 * Route statuses that allow pharmacy/admin QR image retrieval (Phase 26B).
 * Scan/consume validity remains Phase 26C and may stay stricter.
 */
export function isRouteStatusEligibleForQrRetrieval(
  status: RouteStatus,
): boolean {
  return QR_RETRIEVAL_ACTIVE_STATUSES.has(status)
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isValidNonceHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
}

/**
 * Asserts a stop may yield an active QR image for authorised retrieval.
 * Read-only — does not mutate or consume.
 */
export function assertStopEligibleForQrRetrieval(
  routeStatus: RouteStatus,
  stop: DeliveryStopQrEligibilitySubject,
): string {
  if (!isRouteStatusEligibleForQrRetrieval(routeStatus)) {
    throw new DeliveryQrRouteInactiveException()
  }

  const confirmation = stop.qrConfirmation ?? null

  if (confirmation == null) {
    throw new DeliveryQrNotAvailableException()
  }

  if (isStopQrConsumed(stop)) {
    throw new DeliveryQrConsumedException()
  }

  if (confirmation.tokenVersion !== DELIVERY_QR_TOKEN_VERSION) {
    throw new DeliveryQrInvalidStateException()
  }

  if (!isValidNonceHash(confirmation.nonceHash)) {
    throw new DeliveryQrInvalidStateException()
  }

  if (
    !hasText(confirmation.encodedToken) ||
    !confirmation.encodedToken.includes('.')
  ) {
    throw new DeliveryQrInvalidStateException()
  }

  if (
    !(confirmation.issuedAt instanceof Date) ||
    Number.isNaN(confirmation.issuedAt.getTime())
  ) {
    throw new DeliveryQrInvalidStateException()
  }

  // Partial consume metadata without both fields is an invalid persisted state.
  const hasConsumedAt = confirmation.consumedAt != null
  const hasConsumedBy = hasText(confirmation.consumedByUserId)
  if (hasConsumedAt !== hasConsumedBy) {
    throw new DeliveryQrInvalidStateException()
  }

  return confirmation.encodedToken
}
