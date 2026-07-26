/**
 * Deterministic eventId builders for Phase 27C business notifications.
 * Uniqueness is enforced as (recipientUserId, eventId).
 */

export function buildAdminNewOrderEventId(orderId: string): string {
  return `admin-new-order:${orderId}`
}

export function buildBezorgerRouteAssignedEventId(
  routeId: string,
  courierUserId: string,
): string {
  return `bezorger-route-assigned:${routeId}:${courierUserId}`
}

export function buildApothekerRouteStartedEventId(
  routeId: string,
  stopId: string,
): string {
  return `apotheker-route-started:${routeId}:${stopId}`
}

export function buildApothekerNextStopEventId(
  routeId: string,
  completedStopId: string,
  nextStopId: string,
): string {
  return `apotheker-next-stop:${routeId}:${completedStopId}:${nextStopId}`
}

export function buildApothekerDeliveryConfirmedEventId(
  confirmationEventId: string,
): string {
  return `apotheker-delivery-confirmed:${confirmationEventId}`
}
