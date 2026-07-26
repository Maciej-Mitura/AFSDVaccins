import { resolveAuthBearerToken } from '@/firebase/auth-session'
import {
  DeliveryQrRestError,
  parseDeliveryQrRestErrorBody,
} from '@/api/delivery-qr-errors'
import { resolveBackendRestOrigin } from '@/api/vaccine-image-rest'
import { DELIVERY_STOP_QR_CONTENT_TYPE } from '@/api/delivery-stop-qr-image.constants'

export type DeliveryStopQrImageResult = {
  objectUrl: string
  blob: Blob
  contentType: string
}

async function readErrorResponse(
  response: Response,
): Promise<DeliveryQrRestError> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }

  const parsed = parseDeliveryQrRestErrorBody(body, response.status)
  return new DeliveryQrRestError(parsed.status, parsed.code, parsed.message)
}

async function authorizedFetch(
  url: string,
  init: RequestInit,
  authRetry = false,
): Promise<Response> {
  const token = await resolveAuthBearerToken(authRetry)

  if (!token) {
    throw new DeliveryQrRestError(401, 'UNAUTHENTICATED')
  }

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(url, {
    ...init,
    headers,
    cache: 'no-store',
  })

  if (response.status === 401 && !authRetry) {
    return authorizedFetch(url, init, true)
  }

  return response
}

function buildDeliveryStopQrImageUrl(routeId: string, stopId: string): string {
  const origin = resolveBackendRestOrigin()
  return `${origin}/delivery-routes/${encodeURIComponent(routeId)}/stops/${encodeURIComponent(stopId)}/qr`
}

/**
 * Authenticated SVG fetch for pharmacy/admin delivery-stop QR display.
 * Never logs response body or credentials. Caller must revoke object URLs.
 */
export async function fetchDeliveryStopQrImage(
  routeId: string,
  stopId: string,
): Promise<DeliveryStopQrImageResult> {
  if (
    typeof routeId !== 'string' ||
    routeId.length === 0 ||
    typeof stopId !== 'string' ||
    stopId.length === 0
  ) {
    throw new DeliveryQrRestError(404, 'DELIVERY_QR_NOT_FOUND')
  }

  let response: Response
  try {
    response = await authorizedFetch(buildDeliveryStopQrImageUrl(routeId, stopId), {
      method: 'GET',
      headers: {
        Accept: DELIVERY_STOP_QR_CONTENT_TYPE,
      },
    })
  } catch (error: unknown) {
    if (error instanceof DeliveryQrRestError) {
      throw error
    }
    throw new DeliveryQrRestError(0, 'NETWORK_ERROR')
  }

  if (!response.ok) {
    throw await readErrorResponse(response)
  }

  const contentType = (response.headers.get('Content-Type') ?? '')
    .split(';')[0]
    ?.trim()
    .toLowerCase()

  if (contentType !== DELIVERY_STOP_QR_CONTENT_TYPE) {
    throw new DeliveryQrRestError(400, 'DELIVERY_QR_INVALID_STATE')
  }

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)

  return {
    objectUrl,
    blob,
    contentType: DELIVERY_STOP_QR_CONTENT_TYPE,
  }
}

/** Safe download filename — no tokens, pharmacy secrets, or user ids. */
export function buildDeliveryStopQrDownloadFilename(
  routeDate: string,
  stopSequence: number,
): string {
  const safeDate =
    typeof routeDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(routeDate)
      ? routeDate
      : 'unknown-date'
  const sequence =
    typeof stopSequence === 'number' && Number.isFinite(stopSequence)
      ? Math.trunc(stopSequence)
      : 0
  return `delivery-qr-${safeDate}-stop-${sequence}.svg`
}

/**
 * Trigger a browser download for an already-fetched SVG blob.
 * Does not persist beyond the download gesture.
 */
export function downloadDeliveryStopQrSvg(
  blob: Blob,
  filename: string,
): void {
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.rel = 'noopener'
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
  } finally {
    URL.revokeObjectURL(url)
  }
}
