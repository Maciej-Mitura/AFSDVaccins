import { DeliveryStop } from '../routes/delivery-stop.embed'
import { isStopQrConsumed } from '../routes/qr/stop-qr-invariants'

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
 * After a QR confirmation finalises for `completedStop`, select the next
 * pharmacy to notify:
 *
 * 1. Sort stops by sequence ascending
 * 2. Take the first stop with sequence > completedStop.sequence
 * 3. That is undelivered (no deliveryProof / not consumed)
 * 4. Do not wrap to an earlier sequence
 * 5. If none remain, return null (no APOTHEKER_NEXT_STOP)
 */
export function selectNextUndeliveredStop(
  stops: readonly DeliveryStop[],
  completedStop: DeliveryStop,
): DeliveryStop | null {
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence)

  for (const stop of ordered) {
    if (stop.sequence <= completedStop.sequence) {
      continue
    }

    if (isStopDelivered(stop)) {
      continue
    }

    return stop
  }

  return null
}
