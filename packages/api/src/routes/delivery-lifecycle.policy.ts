import { DeliveryStop } from './delivery-stop.embed'
import { isStopDelivered } from './location/derive-next-stop'
import { RouteStatus } from './route-status.enum'

/**
 * Phase 36D — delivery lifecycle (derived UI / completion policy).
 *
 * Expected transitions (no new persisted enums):
 *
 * Route:
 *   ASSIGNED → IN_PROGRESS → COMPLETED (only when every deliverable stop is confirmed)
 *            ↘ CANCELLED
 *
 * Stop (derived):
 *   pending → arrived → delivery_confirmed
 *
 * Order:
 *   PLANNED → DELIVERED only after successful QR confirmation
 *
 * Decision table (Action | Arrival | QR/proof | Order | Notification | UI label):
 *
 * | Mark arrived      | set      | unchanged | PLANNED     | none                         | Arrived |
 * | QR preview        | any      | unchanged | unchanged   | none                         | (preview) |
 * | QR confirm OK     | any      | consumed  | DELIVERED   | APOTHEKER_DELIVERY_CONFIRMED | Delivery confirmed |
 * | QR confirm fail   | any      | unchanged | non-DELIVERED | none                       | (error) |
 * | Route complete    | n/a      | all deliverable stops confirmed | unchanged | none | Completed |
 *
 * Arrival is independent of QR: backend allows QR confirm without prior arrival.
 * Arrival alone never delivers, never consumes QR, never notifies delivery confirmed.
 *
 * Failed-delivery / unavailable-pharmacy exception completion is not modelled;
 * incomplete deliverable stops block completion (future work).
 */

export type DerivedStopLifecycleStatus =
  | 'pending'
  | 'arrived'
  | 'delivery_confirmed'

export type RouteCompletionEligibility = {
  ok: boolean
  incompleteStopCount: number
  incompleteStops: readonly DeliveryStop[]
}

/**
 * True when the stop has at least one associated order that must be QR-confirmed
 * before the route may complete. Empty stops (no orders) do not block completion.
 */
export function stopRequiresDeliveryConfirmation(
  stop: Pick<DeliveryStop, 'orderIds' | 'orderCount'>,
): boolean {
  const orderIdCount = Array.isArray(stop.orderIds) ? stop.orderIds.length : 0
  const orderCount =
    typeof stop.orderCount === 'number' && Number.isFinite(stop.orderCount)
      ? stop.orderCount
      : 0
  return orderIdCount > 0 || orderCount > 0
}

/** Confirmed delivery = delivery proof and/or consumed QR (shared with next-stop). */
export function isStopDeliveryConfirmed(stop: DeliveryStop): boolean {
  return isStopDelivered(stop)
}

export function isStopArrived(stop: DeliveryStop): boolean {
  return stop.arrival != null
}

/**
 * Derived stop lifecycle for manifests, courier UI, and ADMIN diagnostics.
 * Prefer this over ad-hoc `qrConsumed || deliveredAt` checks.
 */
export function deriveStopLifecycleStatus(
  stop: DeliveryStop,
): DerivedStopLifecycleStatus {
  if (isStopDeliveryConfirmed(stop)) {
    return 'delivery_confirmed'
  }
  if (isStopArrived(stop)) {
    return 'arrived'
  }
  return 'pending'
}

export function listIncompleteDeliverableStops(
  stops: readonly DeliveryStop[] | null | undefined,
): DeliveryStop[] {
  return (stops ?? []).filter(
    stop =>
      stopRequiresDeliveryConfirmation(stop) && !isStopDeliveryConfirmed(stop),
  )
}

export function countIncompleteDeliverableStops(
  stops: readonly DeliveryStop[] | null | undefined,
): number {
  return listIncompleteDeliverableStops(stops).length
}

/**
 * Preferred completion policy: block while any deliverable stop lacks confirmed
 * delivery. Zero-stop routes and empty-order stops are eligible.
 */
export function evaluateRouteCompletionEligibility(
  stops: readonly DeliveryStop[] | null | undefined,
): RouteCompletionEligibility {
  const incompleteStops = listIncompleteDeliverableStops(stops)
  if (incompleteStops.length === 0) {
    return { ok: true, incompleteStopCount: 0, incompleteStops: [] }
  }
  return {
    ok: false,
    incompleteStopCount: incompleteStops.length,
    incompleteStops,
  }
}

/**
 * Whether COMPLETED may be requested for this route snapshot.
 * Callers must still enforce the route FSM (IN_PROGRESS → COMPLETED).
 */
export function canCompleteRouteWithCurrentStops(
  routeStatus: RouteStatus,
  stops: readonly DeliveryStop[] | null | undefined,
): RouteCompletionEligibility {
  if (routeStatus !== RouteStatus.IN_PROGRESS) {
    // FSM gate is separate; treat non-IN_PROGRESS as not eligible here.
    const incomplete = listIncompleteDeliverableStops(stops)
    if (incomplete.length > 0) {
      return {
        ok: false,
        incompleteStopCount: incomplete.length,
        incompleteStops: incomplete,
      }
    }
  }
  return evaluateRouteCompletionEligibility(stops)
}
