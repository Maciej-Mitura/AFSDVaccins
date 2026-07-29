/**
 * Phase 36D — client-side stop / route completion helpers.
 * Mirrors API `delivery-lifecycle.policy` semantics using GraphQL-safe fields only.
 */

export type DerivedStopLifecycleStatus =
  | 'pending'
  | 'arrived'
  | 'delivery_confirmed'

export type StopLifecycleFields = {
  orderIds?: readonly string[] | null
  orderCount?: number | null
  qrConsumed?: boolean | null
  deliveredAt?: string | null
  arrival?: {
    clientArrivedAt?: string | null
    recordedAt?: string | null
  } | null
}

export function stopRequiresDeliveryConfirmation(
  stop: StopLifecycleFields,
): boolean {
  const orderIdCount = Array.isArray(stop.orderIds) ? stop.orderIds.length : 0
  const orderCount =
    typeof stop.orderCount === 'number' && Number.isFinite(stop.orderCount)
      ? stop.orderCount
      : 0
  return orderIdCount > 0 || orderCount > 0
}

export function isStopDeliveryConfirmed(stop: StopLifecycleFields): boolean {
  return Boolean(stop.qrConsumed || stop.deliveredAt)
}

export function isStopArrived(stop: StopLifecycleFields): boolean {
  return Boolean(stop.arrival?.recordedAt || stop.arrival?.clientArrivedAt)
}

export function deriveStopLifecycleStatus(
  stop: StopLifecycleFields,
): DerivedStopLifecycleStatus {
  if (isStopDeliveryConfirmed(stop)) {
    return 'delivery_confirmed'
  }
  if (isStopArrived(stop)) {
    return 'arrived'
  }
  return 'pending'
}

export function listIncompleteDeliverableStops<T extends StopLifecycleFields>(
  stops: readonly T[],
): T[] {
  return stops.filter(
    stop =>
      stopRequiresDeliveryConfirmation(stop) && !isStopDeliveryConfirmed(stop),
  )
}

export function evaluateRouteCompletionEligibility(
  stops: readonly StopLifecycleFields[],
): { ok: boolean; incompleteStopCount: number } {
  const incomplete = listIncompleteDeliverableStops(stops)
  return {
    ok: incomplete.length === 0,
    incompleteStopCount: incomplete.length,
  }
}
