import { resolveAuthBearerToken } from '@/firebase/auth-session'
import {
  DeliveryQrRestError,
  parseDeliveryQrRestErrorBody,
} from '@/api/delivery-qr-errors'
import { resolveBackendRestOrigin } from '@/api/vaccine-image-rest'

/** Mirrors backend `DELIVERY_QR_PREVIEW_TOKEN_MAX_LENGTH` / confirm max. */
export const DELIVERY_QR_TOKEN_MAX_LENGTH = 2048

export type DeliveryQrPreviewPharmacy = {
  name: string
  addressLine: string
  postalCode: string
  city: string
}

export type DeliveryQrPreviewOrderLine = {
  vaccineId: string
  vaccineName: string
  quantity: number
}

export type DeliveryQrPreviewOrder = {
  orderId: string
  status: string
  lines: DeliveryQrPreviewOrderLine[]
}

/** Safe courier preview — no token, nonce, or signing material. */
export type DeliveryQrPreviewResult = {
  routeId: string
  stopId: string
  routeDate: string
  routeStatus: string
  stopSequence: number
  stopName: string
  pharmacy: DeliveryQrPreviewPharmacy
  orderCount: number
  orders: DeliveryQrPreviewOrder[]
  totalLineCount: number
  totalItemQuantity: number
  qrIssuedAt: string
  canConfirmDelivery: boolean
}

/** Safe confirmation result — no token or signing material. */
export type DeliveryQrConfirmResult = {
  routeId: string
  stopId: string
  deliveredAt: string
  deliveredByUserId: string
  orderIds: string[]
  orderCount: number
  recipientCity: string
  proofMethod: string
  routeStatus: string
  remainingStopCount: number
}

function deliveryQrUrl(suffix: 'preview' | 'confirm'): string {
  const origin = resolveBackendRestOrigin()
  return `${origin}/delivery-routes/qr/${suffix}`
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
  })

  if (response.status === 401 && !authRetry) {
    return authorizedFetch(url, init, true)
  }

  return response
}

/**
 * Trim and bound a scanned / pasted QR token before sending to the API.
 * Never logs the token value.
 */
export function normalizeDeliveryQrToken(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null
  }

  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed.length > DELIVERY_QR_TOKEN_MAX_LENGTH) {
    return null
  }

  return trimmed
}

async function postDeliveryQrJson<T>(
  suffix: 'preview' | 'confirm',
  token: string,
): Promise<T> {
  const normalised = normalizeDeliveryQrToken(token)
  if (!normalised) {
    throw new DeliveryQrRestError(400, 'DELIVERY_QR_TOKEN_INVALID')
  }

  let response: Response
  try {
    response = await authorizedFetch(deliveryQrUrl(suffix), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: normalised }),
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

  return (await response.json()) as T
}

/**
 * Read-only courier scan preview. Does not consume the QR.
 * Token is sent in the JSON body only — never in the URL.
 */
export async function previewDeliveryQr(
  token: string,
): Promise<DeliveryQrPreviewResult> {
  return postDeliveryQrJson<DeliveryQrPreviewResult>('preview', token)
}

/**
 * Explicit delivery confirmation. Revalidates and consumes the QR on success.
 * Token is sent in the JSON body only — never in the URL.
 */
export async function confirmDeliveryQr(
  token: string,
): Promise<DeliveryQrConfirmResult> {
  return postDeliveryQrJson<DeliveryQrConfirmResult>('confirm', token)
}
