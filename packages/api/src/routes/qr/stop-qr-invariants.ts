import { DeliveryProofMethod } from './delivery-proof-method.enum'
import { StopQrInvariantViolationException } from './delivery-qr.exceptions'
import { DELIVERY_QR_TOKEN_VERSION } from './delivery-qr.constants'
import { StopDeliveryProof } from './stop-delivery-proof.embed'
import { StopQrConfirmation } from './stop-qr-confirmation.embed'

export type StopQrInvariantSubject = {
  stopId?: string
  orderIds?: string[]
  apothekerProfileId?: string
  address?: { city?: string }
  qrConfirmation?: StopQrConfirmation | null
  deliveryProof?: StopDeliveryProof | null
}

export type StopQrInvariantContext = {
  /** Assigned courier user id for the parent DeliveryRoute (when known). */
  assignedCourierUserId?: string
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isValidNonceHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
}

/**
 * Enforce Phase 26A stop QR / delivery-proof invariants.
 * Safe for legacy stops that have neither qrConfirmation nor deliveryProof.
 */
export function assertStopQrInvariants(
  stop: StopQrInvariantSubject,
  context: StopQrInvariantContext = {},
): void {
  const confirmation = stop.qrConfirmation ?? null
  const proof = stop.deliveryProof ?? null

  if (confirmation == null && proof == null) {
    // Legacy generated routes (pre-26A) remain readable without QR state.
    return
  }

  if (confirmation == null && proof != null) {
    throw new StopQrInvariantViolationException(
      'deliveryProof cannot exist without qrConfirmation.',
      'STOP_QR_PROOF_WITHOUT_CONFIRMATION',
    )
  }

  if (confirmation != null) {
    assertQrConfirmationShape(confirmation)
  }

  if (proof != null && confirmation != null) {
    assertDeliveryProofShape(stop, proof, confirmation, context)
  }
}

function assertQrConfirmationShape(confirmation: StopQrConfirmation): void {
  if (confirmation.tokenVersion !== DELIVERY_QR_TOKEN_VERSION) {
    throw new StopQrInvariantViolationException(
      'qrConfirmation.tokenVersion is unsupported.',
      'STOP_QR_INVALID_TOKEN_VERSION',
    )
  }

  if (!isValidNonceHash(confirmation.nonceHash)) {
    throw new StopQrInvariantViolationException(
      'qrConfirmation.nonceHash must be a non-empty SHA-256 hex digest.',
      'STOP_QR_INVALID_NONCE_HASH',
    )
  }

  if (!hasText(confirmation.encodedToken) || !confirmation.encodedToken.includes('.')) {
    throw new StopQrInvariantViolationException(
      'qrConfirmation.encodedToken must be a non-empty signed token.',
      'STOP_QR_INVALID_ENCODED_TOKEN',
    )
  }

  if (!(confirmation.issuedAt instanceof Date) || Number.isNaN(confirmation.issuedAt.getTime())) {
    throw new StopQrInvariantViolationException(
      'qrConfirmation.issuedAt must be a valid Date.',
      'STOP_QR_INVALID_ISSUED_AT',
    )
  }

  const consumedAt = confirmation.consumedAt ?? null
  const consumedBy = confirmation.consumedByUserId ?? null
  const hasConsumedAt = consumedAt != null
  const hasConsumedBy = hasText(consumedBy)

  if (hasConsumedAt !== hasConsumedBy) {
    throw new StopQrInvariantViolationException(
      'consumedAt and consumedByUserId must both be set or both be absent.',
      'STOP_QR_CONSUMED_FIELDS_INCONSISTENT',
    )
  }

  if (hasConsumedAt && (!(consumedAt instanceof Date) || Number.isNaN(consumedAt.getTime()))) {
    throw new StopQrInvariantViolationException(
      'qrConfirmation.consumedAt must be a valid Date when set.',
      'STOP_QR_INVALID_CONSUMED_AT',
    )
  }
}

function assertDeliveryProofShape(
  stop: StopQrInvariantSubject,
  proof: StopDeliveryProof,
  confirmation: StopQrConfirmation,
  context: StopQrInvariantContext,
): void {
  if (proof.method !== DeliveryProofMethod.QR) {
    throw new StopQrInvariantViolationException(
      'deliveryProof.method must be QR in Phase 26.',
      'STOP_QR_INVALID_PROOF_METHOD',
    )
  }

  const consumedAt = confirmation.consumedAt ?? null
  const consumedBy = confirmation.consumedByUserId ?? null

  if (consumedAt == null || !hasText(consumedBy)) {
    throw new StopQrInvariantViolationException(
      'deliveryProof requires a consumed qrConfirmation.',
      'STOP_QR_PROOF_BEFORE_CONSUME',
    )
  }

  if (!(proof.deliveredAt instanceof Date) || Number.isNaN(proof.deliveredAt.getTime())) {
    throw new StopQrInvariantViolationException(
      'deliveryProof.deliveredAt must be a valid Date.',
      'STOP_QR_INVALID_DELIVERED_AT',
    )
  }

  if (!hasText(proof.deliveredByUserId)) {
    throw new StopQrInvariantViolationException(
      'deliveryProof.deliveredByUserId is required.',
      'STOP_QR_INVALID_DELIVERED_BY',
    )
  }

  if (proof.deliveredByUserId !== consumedBy) {
    throw new StopQrInvariantViolationException(
      'deliveryProof.deliveredByUserId must match qrConfirmation.consumedByUserId.',
      'STOP_QR_PROOF_COURIER_MISMATCH',
    )
  }

  if (
    hasText(context.assignedCourierUserId) &&
    proof.deliveredByUserId !== context.assignedCourierUserId
  ) {
    throw new StopQrInvariantViolationException(
      'deliveryProof courier must be the assigned route courier.',
      'STOP_QR_PROOF_NOT_ASSIGNED_COURIER',
    )
  }

  if (!Array.isArray(proof.associatedOrderIds) || proof.associatedOrderIds.length === 0) {
    throw new StopQrInvariantViolationException(
      'deliveryProof.associatedOrderIds must be a non-empty array.',
      'STOP_QR_PROOF_ORDERS_REQUIRED',
    )
  }

  const stopOrderIds = new Set((stop.orderIds ?? []).map(String))
  for (const orderId of proof.associatedOrderIds) {
    if (!hasText(orderId) || !stopOrderIds.has(orderId)) {
      throw new StopQrInvariantViolationException(
        'deliveryProof.associatedOrderIds must belong to the stop.',
        'STOP_QR_PROOF_ORDER_NOT_ON_STOP',
      )
    }
  }

  if (!hasText(proof.recipientProfileId)) {
    throw new StopQrInvariantViolationException(
      'deliveryProof.recipientProfileId is required.',
      'STOP_QR_PROOF_RECIPIENT_REQUIRED',
    )
  }

  if (
    hasText(stop.apothekerProfileId) &&
    proof.recipientProfileId !== stop.apothekerProfileId
  ) {
    throw new StopQrInvariantViolationException(
      'deliveryProof.recipientProfileId must match the stop pharmacy.',
      'STOP_QR_PROOF_RECIPIENT_MISMATCH',
    )
  }

  if (!hasText(proof.recipientCity)) {
    throw new StopQrInvariantViolationException(
      'deliveryProof.recipientCity is required.',
      'STOP_QR_PROOF_CITY_REQUIRED',
    )
  }
}

/** True when the stop has usable, unconsumed QR confirmation metadata. */
export function isStopQrAvailable(stop: StopQrInvariantSubject): boolean {
  const confirmation = stop.qrConfirmation
  if (confirmation == null) {
    return false
  }

  try {
    assertQrConfirmationShape(confirmation)
  } catch {
    return false
  }

  return confirmation.consumedAt == null && confirmation.consumedByUserId == null
}

export function isStopQrConsumed(stop: StopQrInvariantSubject): boolean {
  const confirmation = stop.qrConfirmation
  if (confirmation == null) {
    return false
  }

  return (
    confirmation.consumedAt != null &&
    hasText(confirmation.consumedByUserId)
  )
}

export function getStopDeliveredAt(
  stop: StopQrInvariantSubject,
): Date | null {
  const deliveredAt = stop.deliveryProof?.deliveredAt
  if (!(deliveredAt instanceof Date) || Number.isNaN(deliveredAt.getTime())) {
    return null
  }
  return deliveredAt
}
