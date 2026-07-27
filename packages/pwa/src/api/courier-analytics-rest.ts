import { resolveAuthBearerToken } from '@/firebase/auth-session'
import { resolveBackendRestOrigin } from '@/api/vaccine-image-rest'

export const COURIER_ANALYTICS_CSV_CONTENT_TYPE = 'text/csv'
export const COURIER_ANALYTICS_CSV_FALLBACK_FILENAME =
  'courier-performance-all-time.csv'

export type CourierAnalyticsRestErrorCode =
  | 'UNAUTHENTICATED'
  | 'NETWORK_ERROR'
  | 'COURIER_ANALYTICS_FORBIDDEN'
  | 'COURIER_ANALYTICS_EXPORT_FAILED'
  | 'COURIER_ANALYTICS_GENERATION_FAILED'
  | 'COURIER_ANALYTICS_TOO_LARGE'
  | 'COURIER_ANALYTICS_INVALID_RESPONSE'
  | 'UNKNOWN'

export class CourierAnalyticsRestError extends Error {
  readonly status: number
  readonly code: CourierAnalyticsRestErrorCode

  constructor(
    status: number,
    code: CourierAnalyticsRestErrorCode,
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'CourierAnalyticsRestError'
    this.status = status
    this.code = code
  }
}

export type CourierAnalyticsCsvDownloadResult = {
  blob: Blob
  filename: string
  contentType: string
}

function parseErrorBody(
  body: unknown,
  status: number,
): { code: CourierAnalyticsRestErrorCode; message?: string } {
  if (body && typeof body === 'object') {
    const record = body as { error?: unknown; message?: unknown }
    const code =
      typeof record.error === 'string'
        ? (record.error as CourierAnalyticsRestErrorCode)
        : 'UNKNOWN'
    const message =
      typeof record.message === 'string' ? record.message : undefined
    return { code, message }
  }
  if (status === 401) {
    return { code: 'UNAUTHENTICATED' }
  }
  if (status === 403) {
    return { code: 'COURIER_ANALYTICS_FORBIDDEN' }
  }
  return { code: 'UNKNOWN' }
}

async function readErrorResponse(
  response: Response,
): Promise<CourierAnalyticsRestError> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  const parsed = parseErrorBody(body, response.status)
  return new CourierAnalyticsRestError(
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
    throw new CourierAnalyticsRestError(401, 'UNAUTHENTICATED')
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

/**
 * Prefer Content-Disposition filename when it is a safe basename.
 * Rejects path separators and unexpected characters.
 */
export function filenameFromContentDisposition(
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

export function buildCourierAnalyticsCsvUrl(): string {
  const origin = resolveBackendRestOrigin()
  return `${origin}/analytics/couriers/export.csv`
}

function isCsvContentType(contentTypeHeader: string | null): boolean {
  const contentType = (contentTypeHeader ?? '')
    .split(';')[0]
    ?.trim()
    .toLowerCase()
  return contentType === COURIER_ANALYTICS_CSV_CONTENT_TYPE
}

/**
 * Authenticated ADMIN CSV export download.
 * Never logs CSV bytes or credentials. Does not persist offline.
 */
export async function fetchCourierPerformanceCsv(): Promise<CourierAnalyticsCsvDownloadResult> {
  let response: Response
  try {
    response = await authorizedFetch(buildCourierAnalyticsCsvUrl(), {
      method: 'GET',
      headers: {
        Accept: COURIER_ANALYTICS_CSV_CONTENT_TYPE,
      },
    })
  } catch (error: unknown) {
    if (error instanceof CourierAnalyticsRestError) {
      throw error
    }
    throw new CourierAnalyticsRestError(0, 'NETWORK_ERROR')
  }

  if (!response.ok) {
    throw await readErrorResponse(response)
  }

  if (!isCsvContentType(response.headers.get('Content-Type'))) {
    throw new CourierAnalyticsRestError(
      400,
      'COURIER_ANALYTICS_INVALID_RESPONSE',
    )
  }

  const blob = await response.blob()
  const filename = filenameFromContentDisposition(
    response.headers.get('Content-Disposition'),
    COURIER_ANALYTICS_CSV_FALLBACK_FILENAME,
  )

  return {
    blob,
    filename,
    contentType: COURIER_ANALYTICS_CSV_CONTENT_TYPE,
  }
}

/**
 * Trigger a browser download for an already-fetched CSV blob.
 * Creates a temporary object URL and revokes it immediately after click.
 */
export function downloadCourierAnalyticsCsv(
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
