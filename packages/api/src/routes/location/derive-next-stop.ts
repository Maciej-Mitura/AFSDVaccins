import { DeliveryStop } from '../delivery-stop.embed'
import { isStopQrConsumed } from '../qr/stop-qr-invariants'

/**
 * True when a stop has been delivered (proof written and/or QR consumed).
 * Out-of-order deliveries are supported — sequence alone is not enough.
 */
export function isStopDelivered(stop: DeliveryStop): boolean {
  if (stop.deliveryProof != null) {
    return true
  }

  return isStopQrConsumed(stop)
}

/**
 * Validates that every stop has a finite unique sequence.
 * Fail-safe: invalid/duplicate sequences must not invent a “next” pharmacy.
 */
export function areStopSequencesValid(
  stops: readonly DeliveryStop[],
): boolean {
  const seen = new Set<number>()

  for (const stop of stops) {
    if (
      typeof stop.sequence !== 'number' ||
      !Number.isFinite(stop.sequence)
    ) {
      return false
    }
    if (seen.has(stop.sequence)) {
      return false
    }
    seen.add(stop.sequence)
  }

  return true
}

export type DeriveNextStopResult =
  | { ok: true; stop: DeliveryStop | null }
  | { ok: false; reason: 'invalid_sequence' | 'basis_not_found' }

/**
 * Deterministic next-stop derivation (Phase 30A — single source of truth).
 *
 * Algorithm:
 * 1. Find the basis stop
 * 2. Sort stops by sequence ascending
 * 3. Consider only stops with sequence > basis sequence
 * 4. Exclude stops with deliveryProof or consumed QR
 * 5. Do not wrap to an earlier sequence
 * 6. Return the first remaining stop, or null when none exists
 *
 * Arrived-but-undelivered later stops remain eligible: arrival alone does not
 * skip a stop when deriving “next” from an earlier completed stop.
 *
 * Multi-order stops remain one candidate (one DeliveryStop row).
 */
export function deriveNextStop(
  stops: readonly DeliveryStop[],
  basisStop: DeliveryStop,
): DeriveNextStopResult {
  if (!areStopSequencesValid(stops)) {
    return { ok: false, reason: 'invalid_sequence' }
  }

  const basisInRoute = stops.some(
    stop =>
      (basisStop.stopId && stop.stopId === basisStop.stopId) ||
      stop === basisStop ||
      (stop.sequence === basisStop.sequence &&
        stop.apothekerProfileId === basisStop.apothekerProfileId),
  )

  if (!basisInRoute) {
    return { ok: false, reason: 'basis_not_found' }
  }

  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence)

  for (const stop of ordered) {
    if (stop.sequence <= basisStop.sequence) {
      continue
    }

    if (isStopDelivered(stop)) {
      continue
    }

    return { ok: true, stop }
  }

  return { ok: true, stop: null }
}

/**
 * After a QR confirmation finalises for `completedStop`, select the next
 * pharmacy to notify. Thin wrapper over {@link deriveNextStop} for callers that
 * only need the stop or null (invalid sequences → null, fail-safe).
 */
export function selectNextUndeliveredStop(
  stops: readonly DeliveryStop[],
  completedStop: DeliveryStop,
): DeliveryStop | null {
  const result = deriveNextStop(stops, completedStop)
  if (!result.ok) {
    return null
  }
  return result.stop
}
