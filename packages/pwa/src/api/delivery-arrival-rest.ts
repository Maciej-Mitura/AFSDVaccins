import { resolveAuthBearerToken } from '@/firebase/auth-session'
import { resolveBackendRestOrigin } from '@/api/vaccine-image-rest'
import {
  DeliveryArrivalRestError,
  parseDeliveryArrivalRestErrorBody,
} from '@/api/delivery-arrival-errors'

export type DeliveryStopArrivalResult = {
  routeId: string
  stopId: string
  clientArrivedAt: string
  recordedAt: string
  arrivedByUserId: string
  arrivalStatus: 'RECORDED'
}

export type RecordStopArrivalInput = {
  routeId: string
  stopId: string
  clientArrivedAt: string
  idempotencyKey: string
}

function arrivalUrl(routeId: string, stopId: string): string {
  const origin = resolveBackendRestOrigin()
  return `${origin}/delivery-routes/${encodeURIComponent(routeId)}/stops/${encodeURIComponent(stopId)}/arrival`
}

async function readErrorResponse(
  response: Response,
): Promise<DeliveryArrivalRestError> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }

  const parsed = parseDeliveryArrivalRestErrorBody(body, response.status)
  return new DeliveryArrivalRestError(
    parsed.status,
    parsed.code,
    parsed.message,
  )
}

async function authorizedFetch(
  url: string,
  init: RequestInit,
  authRetry = false,
): Promise<Response> {
  const token = await resolveAuthBearerToken(authRetry)

  if (!token) {
    throw new DeliveryArrivalRestError(401, 'UNAUTHENTICATED')
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
 * Record courier stop arrival. Body never includes user/profile identity.
 * Bearer token is never stored in IndexedDB or the service worker.
 */
export async function recordDeliveryStopArrival(
  input: RecordStopArrivalInput,
): Promise<DeliveryStopArrivalResult> {
  let response: Response
  try {
    response = await authorizedFetch(arrivalUrl(input.routeId, input.stopId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientArrivedAt: input.clientArrivedAt,
        idempotencyKey: input.idempotencyKey,
      }),
    })
  } catch (error: unknown) {
    if (error instanceof DeliveryArrivalRestError) {
      throw error
    }
    throw new DeliveryArrivalRestError(0, 'NETWORK_ERROR')
  }

  if (!response.ok) {
    throw await readErrorResponse(response)
  }

  return (await response.json()) as DeliveryStopArrivalResult
}
