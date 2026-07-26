/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildDeliveryStopQrDownloadFilename,
  downloadDeliveryStopQrSvg,
  fetchDeliveryStopQrImage,
} from '@/api/delivery-stop-qr-image-rest'
import { DeliveryQrRestError } from '@/api/delivery-qr-errors'
import { mapDeliveryStopQrDisplayError } from '@/api/delivery-stop-qr-display-errors'
import { resolveBackendRestOrigin } from '@/api/vaccine-image-rest'
import { __resetAppI18nForTests } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

vi.mock('@/firebase/auth-session', () => ({
  resolveAuthBearerToken: vi.fn(() => Promise.resolve('test-firebase-token')),
}))

import { resolveAuthBearerToken } from '@/firebase/auth-session'

function requestUrl(call: unknown): string {
  if (typeof call === 'string') {
    return call
  }
  if (call instanceof URL) {
    return call.toString()
  }
  if (typeof call === 'object' && call !== null && 'url' in call) {
    return String(Reflect.get(call, 'url'))
  }
  return ''
}

describe('delivery-stop-qr-image-rest', () => {
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

  it('attaches Firebase bearer token and validates SVG Content-Type', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    vi.mocked(fetch).mockResolvedValue(
      new Response(blob, {
        status: 200,
        headers: { 'Content-Type': 'image/svg+xml' },
      }),
    )

    const createObjectURL = vi.fn(() => 'blob:qr-1')
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL: vi.fn(),
    })

    const result = await fetchDeliveryStopQrImage('route-1', 'stop-1')

    expect(result.objectUrl).toBe('blob:qr-1')
    expect(createObjectURL).toHaveBeenCalled()
    expect(resolveAuthBearerToken).toHaveBeenCalled()

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(requestUrl(url)).toBe(
      `${resolveBackendRestOrigin()}/delivery-routes/route-1/stops/stop-1/qr`,
    )
    const headers = new Headers(init?.headers)
    expect(headers.get('Authorization')).toBe('Bearer test-firebase-token')
  })

  it('retries authentication once on 401', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(blob, {
          status: 200,
          headers: { 'Content-Type': 'image/svg+xml' },
        }),
      )
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:qr-2'),
      revokeObjectURL: vi.fn(),
    })

    await fetchDeliveryStopQrImage('route-1', 'stop-1')

    expect(resolveAuthBearerToken).toHaveBeenCalledWith(false)
    expect(resolveAuthBearerToken).toHaveBeenCalledWith(true)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('rejects non-SVG Content-Type', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(fetchDeliveryStopQrImage('route-1', 'stop-1')).rejects.toEqual(
      expect.objectContaining({
        code: 'DELIVERY_QR_INVALID_STATE',
      }),
    )
  })

  it('builds a safe download filename without tokens', () => {
    const filename = buildDeliveryStopQrDownloadFilename('2026-07-26', 3)
    expect(filename).toBe('delivery-qr-2026-07-26-stop-3.svg')
    expect(filename).not.toMatch(/token|nonce|user/i)
  })

  it('downloads via object URL and revokes it', () => {
    const revoke = vi.fn()
    const create = vi.fn(() => 'blob:dl-1')
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: create,
      revokeObjectURL: revoke,
    })

    const blob = new Blob(['<svg/>'], { type: 'image/svg+xml' })
    downloadDeliveryStopQrSvg(blob, 'delivery-qr-2026-07-26-stop-1.svg')

    expect(create).toHaveBeenCalled()
    expect(revoke).toHaveBeenCalledWith('blob:dl-1')
  })

  it('maps known display QR errors to precise messages', () => {
    expect(
      mapDeliveryStopQrDisplayError(
        new DeliveryQrRestError(403, 'DELIVERY_QR_FORBIDDEN'),
      ),
    ).toBe('You are not allowed to view this delivery QR.')

    expect(
      mapDeliveryStopQrDisplayError(
        new DeliveryQrRestError(400, 'DELIVERY_QR_CONSUMED'),
      ),
    ).toBe('This delivery QR has already been used.')

    expect(
      mapDeliveryStopQrDisplayError(
        new DeliveryQrRestError(403, 'DELIVERY_QR_FORBIDDEN'),
      ),
    ).not.toMatch(/courier|token|nonce/i)
  })
})
