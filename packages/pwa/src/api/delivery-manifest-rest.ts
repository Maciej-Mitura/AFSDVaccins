import { resolveAuthBearerToken } from '@/firebase/auth-session'
import { resolveBackendRestOrigin } from '@/api/vaccine-image-rest'

export const DELIVERY_MANIFEST_CONTENT_TYPE = 'application/pdf'

export type DeliveryManifestRestErrorCode =
  | 'UNAUTHENTICATED'
  | 'NETWORK_ERROR'
  | 'DELIVERY_MANIFEST_ROUTE_NOT_FOUND'
  | 'DELIVERY_MANIFEST_STOP_NOT_FOUND'
  | 'DELIVERY_MANIFEST_FORBIDDEN'
  | 'DELIVERY_MANIFEST_ROUTE_UNAVAILABLE'
  | 'DELIVERY_MANIFEST_ORDER_INTEGRITY_ERROR'
  | 'DELIVERY_MANIFEST_QR_UNAVAILABLE'
  | 'DELIVERY_MANIFEST_GENERATION_FAILED'
  | 'DELIVERY_MANIFEST_TOO_LARGE'
  | 'DELIVERY_MANIFEST_INVALID_RESPONSE'
  | 'UNKNOWN'

export class DeliveryManifestRestError extends Error {
  readonly status: number
  readonly code: DeliveryManifestRestErrorCode

  constructor(
    status: number,
    code: DeliveryManifestRestErrorCode,
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'DeliveryManifestRestError'
    this.status = status
    this.code = code
  }
}

export type DeliveryManifestDownloadResult = {
  blob: Blob
  filename: string
  contentType: string
}

function parseManifestErrorBody(
  body: unknown,
  status: number,
): { code: DeliveryManifestRestErrorCode; message?: string } {
  if (body && typeof body === 'object') {
    const record = body as { error?: unknown; message?: unknown }
    const code =
      typeof record.error === 'string'
        ? (record.error as DeliveryManifestRestErrorCode)
        : 'UNKNOWN'
    const message =
      typeof record.message === 'string' ? record.message : undefined
    return { code, message }
  }
  if (status === 401) {
    return { code: 'UNAUTHENTICATED' }
  }
  if (status === 403) {
    return { code: 'DELIVERY_MANIFEST_FORBIDDEN' }
  }
  return { code: 'UNKNOWN' }
}

async function readErrorResponse(
  response: Response,
): Promise<DeliveryManifestRestError> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  const parsed = parseManifestErrorBody(body, response.status)
  return new DeliveryManifestRestError(
    response.status,
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
    throw new DeliveryManifestRestError(401, 'UNAUTHENTICATED')
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

function filenameFromContentDisposition(
  header: string | null,
  fallback: string,
): string {
  if (!header) {
    return fallback
  }
  const match = /filename="([^"]+)"/i.exec(header)
  if (match?.[1] && /^[\w.\-]+$/.test(match[1])) {
    return match[1]
  }
  return fallback
}

export function buildRouteManifestUrl(routeId: string): string {
  const origin = resolveBackendRestOrigin()
  return `${origin}/delivery-routes/${encodeURIComponent(routeId)}/manifest.pdf`
}

export function buildStopManifestUrl(routeId: string, stopId: string): string {
  const origin = resolveBackendRestOrigin()
  return `${origin}/delivery-routes/${encodeURIComponent(routeId)}/stops/${encodeURIComponent(stopId)}/manifest.pdf`
}

export function buildRouteManifestFallbackFilename(
  routeDate: string,
  routeId: string,
): string {
  const safeDate =
    typeof routeDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(routeDate)
      ? routeDate
      : 'unknown-date'
  const shortId = routeId
    .replace(/[^a-fA-F0-9]/g, '')
    .slice(-8)
    .toLowerCase()
  return `delivery-manifest-${safeDate}-route-${shortId || 'unknown'}.pdf`
}

export function buildStopManifestFallbackFilename(
  routeDate: string,
  routeId: string,
  stopSequence: number,
): string {
  const base = buildRouteManifestFallbackFilename(routeDate, routeId).replace(
    /\.pdf$/,
    '',
  )
  const sequence =
    typeof stopSequence === 'number' && Number.isFinite(stopSequence)
      ? Math.trunc(stopSequence)
      : 0
  return `${base}-stop-${sequence}.pdf`
}

async function fetchManifestPdf(
  url: string,
  fallbackFilename: string,
): Promise<DeliveryManifestDownloadResult> {
  let response: Response
  try {
    response = await authorizedFetch(url, {
      method: 'GET',
      headers: {
        Accept: DELIVERY_MANIFEST_CONTENT_TYPE,
      },
    })
  } catch (error: unknown) {
    if (error instanceof DeliveryManifestRestError) {
      throw error
    }
    throw new DeliveryManifestRestError(0, 'NETWORK_ERROR')
  }

  if (!response.ok) {
    throw await readErrorResponse(response)
  }

  const contentType = (response.headers.get('Content-Type') ?? '')
    .split(';')[0]
    ?.trim()
    .toLowerCase()

  if (contentType !== DELIVERY_MANIFEST_CONTENT_TYPE) {
    throw new DeliveryManifestRestError(
      400,
      'DELIVERY_MANIFEST_INVALID_RESPONSE',
    )
  }

  const blob = await response.blob()
  const filename = filenameFromContentDisposition(
    response.headers.get('Content-Disposition'),
    fallbackFilename,
  )

  return {
    blob,
    filename,
    contentType: DELIVERY_MANIFEST_CONTENT_TYPE,
  }
}

/**
 * Authenticated full-route manifest download.
 * Never logs PDF bytes or credentials. Does not persist offline.
 */
export async function fetchRouteManifestPdf(
  routeId: string,
  routeDate: string,
): Promise<DeliveryManifestDownloadResult> {
  if (typeof routeId !== 'string' || routeId.length === 0) {
    throw new DeliveryManifestRestError(
      404,
      'DELIVERY_MANIFEST_ROUTE_NOT_FOUND',
    )
  }

  return fetchManifestPdf(
    buildRouteManifestUrl(routeId),
    buildRouteManifestFallbackFilename(routeDate, routeId),
  )
}

/**
 * Authenticated stop-scoped manifest download.
 */
export async function fetchStopManifestPdf(
  routeId: string,
  stopId: string,
  routeDate: string,
  stopSequence: number,
): Promise<DeliveryManifestDownloadResult> {
  if (
    typeof routeId !== 'string' ||
    routeId.length === 0 ||
    typeof stopId !== 'string' ||
    stopId.length === 0
  ) {
    throw new DeliveryManifestRestError(404, 'DELIVERY_MANIFEST_STOP_NOT_FOUND')
  }

  return fetchManifestPdf(
    buildStopManifestUrl(routeId, stopId),
    buildStopManifestFallbackFilename(routeDate, routeId, stopSequence),
  )
}

/**
 * Trigger a browser download for an already-fetched PDF blob.
 * Creates a temporary object URL and revokes it immediately after click.
 */
export function downloadManifestPdf(blob: Blob, filename: string): void {
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
