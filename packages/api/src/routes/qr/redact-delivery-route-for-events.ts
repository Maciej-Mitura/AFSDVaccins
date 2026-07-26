import { DeliveryRoute } from '../delivery-route.entity'
import { DeliveryStop } from '../delivery-stop.embed'
import { RouteLastKnownLocation } from '../location/route-last-known-location.embed'
import { StopQrConfirmation } from './stop-qr-confirmation.embed'

/**
 * Strip bearer QR material and private location correlation fields before
 * PubSub / event fan-out.
 *
 * `encodedToken` must never appear in subscription payloads.
 * Location `eventId` / courier profile ids stay persistence-only.
 */
export function redactDeliveryRouteForEvents(
  route: DeliveryRoute,
): DeliveryRoute {
  return {
    ...route,
    lastKnownLocation: redactLastKnownLocation(route.lastKnownLocation),
    stops: (route.stops ?? []).map(redactDeliveryStopForEvents),
  } as DeliveryRoute
}

function redactLastKnownLocation(
  location: RouteLastKnownLocation | null | undefined,
): RouteLastKnownLocation | null {
  if (location == null) {
    return null
  }

  return {
    stopId: location.stopId,
    stopSequence: location.stopSequence,
    city: location.city,
    recordedAt: location.recordedAt,
    source: location.source,
    // Persistence-only fields cleared for event fan-out.
    recordedByUserId: '',
    recordedByBezorgerProfileId: '',
    eventId: '',
  }
}

function redactDeliveryStopForEvents(stop: DeliveryStop): DeliveryStop {
  if (stop.qrConfirmation == null) {
    return { ...stop }
  }

  const {
    tokenVersion,
    nonceHash,
    issuedAt,
    consumedAt,
    consumedByUserId,
  } = stop.qrConfirmation

  const redactedConfirmation = {
    tokenVersion,
    nonceHash,
    issuedAt,
    consumedAt,
    consumedByUserId,
  } as unknown as StopQrConfirmation

  return {
    ...stop,
    qrConfirmation: redactedConfirmation,
  }
}
