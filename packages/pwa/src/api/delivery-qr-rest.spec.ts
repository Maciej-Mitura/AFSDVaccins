/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  confirmDeliveryQr,
  normalizeDeliveryQrToken,
  previewDeliveryQr,
  DELIVERY_QR_TOKEN_MAX_LENGTH,
} from '@/api/delivery-qr-rest'
import {
  DeliveryQrRestError,
  mapDeliveryQrRestError,
} from '@/api/delivery-qr-errors'
import { resolveBackendRestOrigin } from '@/api/vaccine-image-rest'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

vi.mock('@/firebase/auth-session', () => ({
  resolveAuthBearerToken: vi.fn(() => Promise.resolve('test-firebase-token')),
}))

import { resolveAuthBearerToken } from '@/firebase/auth-session'

const previewPayload = {
  routeId: 'route-1',
  stopId: 'stop-1',
  routeDate: '2026-07-26',
  routeStatus: 'IN_PROGRESS',
  stopSequence: 2,
  stopName: 'Apotheek Centrum',
  pharmacy: {
    name: 'Apotheek Centrum',
    addressLine: 'Hoofdstraat 1',
    postalCode: '1000AA',
    city: 'Amsterdam',
  },
  orderCount: 2,
  orders: [
    {
      orderId: 'ord-1',
      status: 'PLANNED',
      lines: [
        { vaccineId: 'v1', vaccineName: 'Vaccine A', quantity: 3 },
        { vaccineId: 'v2', vaccineName: 'Vaccine B', quantity: 1 },
      ],
    },
    {
      orderId: 'ord-2',
      status: 'PLANNED',
      lines: [{ vaccineId: 'v1', vaccineName: 'Vaccine A', quantity: 2 }],
    },
  ],
  totalLineCount: 3,
  totalItemQuantity: 6,
  qrIssuedAt: '2026-07-26T08:00:00.000Z',
  canConfirmDelivery: true,
}

const confirmPayload = {
  routeId: 'route-1',
  stopId: 'stop-1',
  deliveredAt: '2026-07-26T10:00:00.000Z',
  deliveredByUserId: 'user-1',
  orderIds: ['ord-1', 'ord-2'],
  orderCount: 2,
  recipientCity: 'Amsterdam',
  proofMethod: 'QR_SCAN',
  routeStatus: 'IN_PROGRESS',
  remainingStopCount: 1,
}

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

describe('delivery-qr-rest', () => {
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

  it('posts preview token in JSON body never URL and attaches bearer', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(previewPayload), { status: 200 }),
    )

    const token = 'signed-qr-token-value'
    await previewDeliveryQr(token)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const call = fetchMock.mock.calls[0]
    expect(call).toBeDefined()
    if (!call) {
      return
    }

    const url = requestUrl(call[0])
    expect(url).toBe(`${resolveBackendRestOrigin()}/delivery-routes/qr/preview`)
    expect(url).not.toContain(token)
    expect(url).not.toContain('token=')

    const init = call[1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ token }))
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer test-firebase-token')
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('posts confirm token in JSON body never URL', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(confirmPayload), { status: 200 }),
    )

    const token = 'confirm-token-secret'
    await confirmDeliveryQr(token)

    const call = fetchMock.mock.calls[0]
    expect(call).toBeDefined()
    if (!call) {
      return
    }
    const url = requestUrl(call[0])
    expect(url).toBe(`${resolveBackendRestOrigin()}/delivery-routes/qr/confirm`)
    expect(url).not.toContain(token)
    expect(call[1]?.body).toBe(JSON.stringify({ token }))
  })

  it('retries authentication once on 401', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(previewPayload), { status: 200 }),
      )

    vi.mocked(resolveAuthBearerToken)
      .mockResolvedValueOnce('stale-token')
      .mockResolvedValueOnce('fresh-token')

    await previewDeliveryQr('tok')

    expect(resolveAuthBearerToken).toHaveBeenCalledWith(false)
    expect(resolveAuthBearerToken).toHaveBeenCalledWith(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('maps stable backend error codes without exposing token', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'Bezorg-QR token is ongeldig.',
          error: 'DELIVERY_QR_TOKEN_INVALID',
        }),
        { status: 400 },
      ),
    )

    await expect(previewDeliveryQr('bad-token-secret')).rejects.toMatchObject({
      code: 'DELIVERY_QR_TOKEN_INVALID',
      status: 400,
    })

    const message = mapDeliveryQrRestError(
      new DeliveryQrRestError(400, 'DELIVERY_QR_TOKEN_INVALID'),
    )
    expect(message).toBe(translate('errors.deliveryQr.tokenInvalid'))
    expect(message).not.toContain('bad-token-secret')
  })

  it('rejects oversized tokens client-side', () => {
    expect(
      normalizeDeliveryQrToken('a'.repeat(DELIVERY_QR_TOKEN_MAX_LENGTH + 1)),
    ).toBeNull()
    expect(normalizeDeliveryQrToken('  ok-token  ')).toBe('ok-token')
  })

  it('maps network failures', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(previewDeliveryQr('tok')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    })
  })
})
