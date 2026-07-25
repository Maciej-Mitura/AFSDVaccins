import { DeliveryRoute } from '../delivery-route.entity'
import { DeliveryStop } from '../delivery-stop.embed'
import { StopQrConfirmation } from './stop-qr-confirmation.embed'

/**
 * Strip bearer QR material before PubSub / event fan-out.
 * `encodedToken` must never appear in subscription payloads.
 */
export function redactDeliveryRouteForEvents(
  route: DeliveryRoute,
): DeliveryRoute {
  return {
    ...route,
    stops: (route.stops ?? []).map(redactDeliveryStopForEvents),
  } as DeliveryRoute
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
