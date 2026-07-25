import { resolveAuthBearerToken } from '@/firebase/auth-session'
import {
  VaccineImageRestError,
  parseVaccineImageRestErrorBody,
} from '@/api/vaccine-image-errors'

/** Max upload size — mirrors backend `VACCINE_IMAGE_MAX_BYTES`. */
export const VACCINE_IMAGE_MAX_BYTES = 5 * 1024 * 1024

export const VACCINE_IMAGE_ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export type VaccineImageAcceptedMimeType =
  (typeof VACCINE_IMAGE_ACCEPTED_MIME_TYPES)[number]

export const VACCINE_IMAGE_OVERRIDE_REASON_MAX_LENGTH = 500

export type VaccineImageValidationStatusValue =
  | 'PENDING_ANALYSIS'
  | 'ACCEPTED'
  | 'REVIEW_REQUIRED'
  | 'REJECTED'
  | 'ANALYSIS_FAILED'

/** Safe image metadata returned by REST and GraphQL (no blob object keys). */
export type VaccineImageSafePayload = {
  originalFilename: string
  mimeType: string
  width: number
  height: number
  validationStatus: VaccineImageValidationStatusValue
  aiCaption: string | null
  aiConfidence: number | null
  aiTags: string[]
  aiReason: string | null
  uploadedAt: string
  imageUrl: string | null
}

export type VaccineImageUploadResponse = {
  vaccineId: string
  image: VaccineImageSafePayload
}

export type VaccineImageDeleteResponse = {
  vaccineId: string
  deleted: boolean
}

export type VaccineImageOverrideResponse = {
  vaccineId: string
  image: VaccineImageSafePayload
}

export type VaccineImageOverrideDecision = 'ACCEPTED' | 'REJECTED'

/**
 * Derive the public REST origin from the configured GraphQL backend URL.
 * Example: `https://api.example.com/graphql` → `https://api.example.com`
 */
export function resolveBackendRestOrigin(
  graphqlUrl: string = import.meta.env.VITE_BACKEND_URL,
): string {
  return String(graphqlUrl).replace(/\/graphql\/?$/i, '')
}

function vaccineImageUrl(vaccineId: string, suffix = ''): string {
  const origin = resolveBackendRestOrigin()
  return `${origin}/vaccines/${encodeURIComponent(vaccineId)}/image${suffix}`
}

async function readErrorResponse(
  response: Response,
): Promise<VaccineImageRestError> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }

  const parsed = parseVaccineImageRestErrorBody(body, response.status)
  return new VaccineImageRestError(parsed.status, parsed.code, parsed.message)
}

async function authorizedFetch(
  url: string,
  init: RequestInit,
  authRetry = false,
): Promise<Response> {
  const token = await resolveAuthBearerToken(authRetry)

  if (!token) {
    throw new VaccineImageRestError(401, 'UNAUTHENTICATED')
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
 * Upload or replace a vaccine catalogue image (ADMIN).
 * Multipart field name must be `image`. Do not set Content-Type manually.
 */
export async function uploadVaccineImage(
  vaccineId: string,
  file: File,
): Promise<VaccineImageUploadResponse> {
  const formData = new FormData()
  formData.append('image', file)

  let response: Response
  try {
    response = await authorizedFetch(vaccineImageUrl(vaccineId), {
      method: 'POST',
      body: formData,
    })
  } catch (error: unknown) {
    if (error instanceof VaccineImageRestError) {
      throw error
    }
    throw new VaccineImageRestError(0, 'NETWORK_ERROR')
  }

  if (!response.ok) {
    throw await readErrorResponse(response)
  }

  return (await response.json()) as VaccineImageUploadResponse
}

/** Delete vaccine image (ADMIN). Idempotent when no image exists. */
export async function deleteVaccineImage(
  vaccineId: string,
): Promise<VaccineImageDeleteResponse> {
  let response: Response
  try {
    response = await authorizedFetch(vaccineImageUrl(vaccineId), {
      method: 'DELETE',
    })
  } catch (error: unknown) {
    if (error instanceof VaccineImageRestError) {
      throw error
    }
    throw new VaccineImageRestError(0, 'NETWORK_ERROR')
  }

  if (!response.ok) {
    throw await readErrorResponse(response)
  }

  return (await response.json()) as VaccineImageDeleteResponse
}

/** Override AI validation decision (ADMIN). */
export async function overrideVaccineImage(
  vaccineId: string,
  decision: VaccineImageOverrideDecision,
  reason: string,
): Promise<VaccineImageOverrideResponse> {
  let response: Response
  try {
    response = await authorizedFetch(vaccineImageUrl(vaccineId, '/override'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision, reason }),
    })
  } catch (error: unknown) {
    if (error instanceof VaccineImageRestError) {
      throw error
    }
    throw new VaccineImageRestError(0, 'NETWORK_ERROR')
  }

  if (!response.ok) {
    throw await readErrorResponse(response)
  }

  return (await response.json()) as VaccineImageOverrideResponse
}
