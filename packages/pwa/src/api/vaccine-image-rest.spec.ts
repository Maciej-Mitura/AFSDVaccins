/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  resolveBackendRestOrigin,
  uploadVaccineImage,
  deleteVaccineImage,
  overrideVaccineImage,
  VACCINE_IMAGE_MAX_BYTES,
} from '@/api/vaccine-image-rest'
import {
  VaccineImageRestError,
  mapVaccineImageRestError,
} from '@/api/vaccine-image-errors'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

vi.mock('@/firebase/auth-session', () => ({
  resolveAuthBearerToken: vi.fn(() => Promise.resolve('test-firebase-token')),
}))

import { resolveAuthBearerToken } from '@/firebase/auth-session'

const acceptedImagePayload = {
  originalFilename: 'vial.png',
  mimeType: 'image/png',
  width: 200,
  height: 200,
  validationStatus: 'ACCEPTED',
  aiCaption: null,
  aiConfidence: null,
  aiTags: [] as string[],
  aiReason: null,
  uploadedAt: '2026-01-01T00:00:00.000Z',
  imageUrl: 'https://signed.example/img',
}

function pngFile(name = 'vial.png', size = 1024): File {
  const bytes = new Uint8Array(size)
  bytes[0] = 0x89
  bytes[1] = 0x50
  bytes[2] = 0x4e
  bytes[3] = 0x47
  return new File([bytes], name, { type: 'image/png' })
}

function requestUrl(call: unknown): string {
  if (typeof call === 'string') {
    return call
  }
  if (call instanceof URL) {
    return call.toString()
  }
  if (typeof call === 'object' && call !== null && 'url' in call) {
    return String(call.url)
  }
  return ''
}

function requestInit(call: unknown): RequestInit | undefined {
  if (call && typeof call === 'object') {
    return call
  }
  return undefined
}

function asJsonBody(body: BodyInit | null | undefined): string {
  if (typeof body === 'string') {
    return body
  }
  throw new Error('Expected JSON string body')
}

describe('vaccine-image-rest', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
    vi.stubGlobal('fetch', vi.fn())
    vi.mocked(resolveAuthBearerToken).mockResolvedValue('test-firebase-token')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('derives REST origin by stripping /graphql', () => {
    expect(resolveBackendRestOrigin('https://api.example.com/graphql')).toBe(
      'https://api.example.com',
    )
    expect(resolveBackendRestOrigin('http://localhost:3000/graphql/')).toBe(
      'http://localhost:3000',
    )
  })

  it('uploads with FormData field name image and Firebase bearer token', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ vaccineId: 'v1', image: acceptedImagePayload }),
        { status: 200 },
      ),
    )

    const file = pngFile()
    await uploadVaccineImage('v1', file)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const call = fetchMock.mock.calls[0]
    expect(call).toBeDefined()
    if (!call) {
      return
    }
    const url = requestUrl(call[0])
    const init = requestInit(call[1])
    expect(url).toContain('/vaccines/v1/image')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeInstanceOf(FormData)
    const formData = init!.body as FormData
    expect(formData.get('image')).toBeInstanceOf(File)

    const headers = new Headers(init?.headers)
    expect(headers.get('Authorization')).toBe('Bearer test-firebase-token')
    expect(headers.get('Content-Type')).toBeNull()
  })

  it('does not manually set multipart Content-Type', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          vaccineId: 'v1',
          image: { ...acceptedImagePayload, aiConfidence: 0.9, imageUrl: null },
        }),
        { status: 200 },
      ),
    )

    await uploadVaccineImage('v1', pngFile())
    const call = fetchMock.mock.calls[0]
    expect(call).toBeDefined()
    if (!call) {
      return
    }
    const headers = new Headers(requestInit(call[1])?.headers)
    expect(headers.has('Content-Type')).toBe(false)
  })

  it('maps 429 to a clear rate-limit message', () => {
    const message = mapVaccineImageRestError(
      new VaccineImageRestError(429, 'RATE_LIMITED'),
    )
    expect(message).toBe(translate('errors.vaccineImage.rateLimited'))
  })

  it('maps unauthorised and forbidden errors', () => {
    expect(
      mapVaccineImageRestError(
        new VaccineImageRestError(401, 'UNAUTHENTICATED'),
      ),
    ).toBe(translate('errors.vaccineImage.unauthorized'))
    expect(
      mapVaccineImageRestError(new VaccineImageRestError(403, 'FORBIDDEN')),
    ).toBe(translate('errors.vaccineImage.forbidden'))
  })

  it('delete and override call the correct endpoints', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ vaccineId: 'v1', deleted: true }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ vaccineId: 'v1', image: acceptedImagePayload }),
          { status: 200 },
        ),
      )

    await deleteVaccineImage('v1')
    await overrideVaccineImage('v1', 'ACCEPTED', 'Looks like a vial')

    const deleteCall = fetchMock.mock.calls[0]
    const overrideCall = fetchMock.mock.calls[1]
    expect(deleteCall).toBeDefined()
    expect(overrideCall).toBeDefined()
    if (!deleteCall || !overrideCall) {
      return
    }
    expect(requestUrl(deleteCall[0])).toContain('/vaccines/v1/image')
    expect(requestInit(deleteCall[1])?.method).toBe('DELETE')
    expect(requestUrl(overrideCall[0])).toContain('/vaccines/v1/image/override')
    expect(requestInit(overrideCall[1])?.method).toBe('POST')
    const body = requestInit(overrideCall[1])?.body
    expect(JSON.parse(asJsonBody(body))).toEqual({
      decision: 'ACCEPTED',
      reason: 'Looks like a vial',
    })
  })

  it('exposes the 5 MB client constant matching backend', () => {
    expect(VACCINE_IMAGE_MAX_BYTES).toBe(5 * 1024 * 1024)
  })
})
