/** QR error-correction level for on-demand stop QR images. */
export const DELIVERY_STOP_QR_ERROR_CORRECTION = 'M' as const

/** Quiet-zone modules around the QR matrix. */
export const DELIVERY_STOP_QR_MARGIN_MODULES = 4

/** Nominal SVG / PNG edge length in pixels (viewBox width/height). */
export const DELIVERY_STOP_QR_SIZE_PX = 256

/** Content-Disposition filename for inline QR responses (no secrets). */
export const DELIVERY_STOP_QR_FILENAME = 'delivery-stop-qr.svg'

export const DELIVERY_STOP_QR_CONTENT_TYPE = 'image/svg+xml'

export const DELIVERY_STOP_QR_CACHE_CONTROL = 'private, no-store'

/** Relative authenticated render path used in safe GraphQL metadata. */
export function buildDeliveryStopQrImagePath(
  routeId: string,
  stopId: string,
): string {
  return `/delivery-routes/${encodeURIComponent(routeId)}/stops/${encodeURIComponent(stopId)}/qr`
}
