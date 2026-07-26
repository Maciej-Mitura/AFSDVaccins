/**
 * Phase 29A delivery-manifest constants.
 * In-memory generation is acceptable when bounded by these limits.
 */

export const DELIVERY_MANIFEST_CONTENT_TYPE = 'application/pdf'

export const DELIVERY_MANIFEST_CACHE_CONTROL = 'private, no-store'

export const DELIVERY_MANIFEST_APPLICATION_NAME = 'Vaccinatie-levering'

/** Maximum stops in a single full-route manifest. */
export const DELIVERY_MANIFEST_MAX_STOPS = 50

/** Maximum orders across all included stops. */
export const DELIVERY_MANIFEST_MAX_ORDERS = 200

/** Maximum vaccine lines across all included orders. */
export const DELIVERY_MANIFEST_MAX_LINES = 1000

/** Soft ceiling for generated PDF byte length (~5 MiB). */
export const DELIVERY_MANIFEST_MAX_PDF_BYTES = 5 * 1024 * 1024

/** Nominal QR PNG edge length embedded in the PDF (px). */
export const DELIVERY_MANIFEST_QR_SIZE_PX = 160

export function buildDeliveryRouteManifestPath(routeId: string): string {
  return `/delivery-routes/${encodeURIComponent(routeId)}/manifest.pdf`
}

export function buildDeliveryStopManifestPath(
  routeId: string,
  stopId: string,
): string {
  return `/delivery-routes/${encodeURIComponent(routeId)}/stops/${encodeURIComponent(stopId)}/manifest.pdf`
}
