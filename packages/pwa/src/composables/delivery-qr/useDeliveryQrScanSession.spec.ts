/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDeliveryQrScanSession } from '@/composables/delivery-qr/useDeliveryQrScanSession'
import {
  DeliveryQrCameraError,
  __resetDeliveryQrScannerProviderForTests,
  setDeliveryQrScannerProvider,
  vueQrcodeReaderScannerProvider,
} from '@/composables/delivery-qr/delivery-qr-scanner-provider'
import { DeliveryQrRestError } from '@/api/delivery-qr-errors'
import { __resetAppI18nForTests } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

const previewMock = vi.fn()
const confirmMock = vi.fn()

vi.mock('@/api/delivery-qr-rest', async () => {
  const actual = await vi.importActual<typeof import('@/api/delivery-qr-rest')>(
    '@/api/delivery-qr-rest',
  )
  return {
    ...actual,
    previewDeliveryQr: (...args: unknown[]) => previewMock(...args),
    confirmDeliveryQr: (...args: unknown[]) => confirmMock(...args),
  }
})

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

describe('useDeliveryQrScanSession', () => {
  let isOnline = true
  let canOpen = true
  const onRefreshRoute = vi.fn()

  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
    __resetDeliveryQrScannerProviderForTests()
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(),
      },
    })
    isOnline = true
    canOpen = true
    previewMock.mockReset()
    confirmMock.mockReset()
    onRefreshRoute.mockReset()
    previewMock.mockResolvedValue(previewPayload)
    confirmMock.mockResolvedValue(confirmPayload)
  })

  afterEach(() => {
    __resetDeliveryQrScannerProviderForTests()
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    vi.clearAllMocks()
  })

  function createSession() {
    return useDeliveryQrScanSession({
      canOpen: () => canOpen,
      isOnline: () => isOnline,
      onRefreshRoute,
    })
  }

  it('opens scanner only when allowed and online', () => {
    const session = createSession()
    canOpen = false
    session.openScanner()
    expect(session.phase.value).toBe('closed')

    canOpen = true
    isOnline = false
    session.openScanner()
    expect(session.phase.value).toBe('offline')

    isOnline = true
    session.openScanner()
    expect(session.phase.value).toBe('preparing')
  })

  it('requests camera only after open and prefers rear-facing constraints', () => {
    const session = createSession()
    expect(session.phase.value).toBe('closed')
    session.openScanner()
    session.onCameraPermissionRequested()
    expect(session.phase.value).toBe('requesting-permission')
    expect(vueQrcodeReaderScannerProvider.getConstraints()).toEqual({
      facingMode: { ideal: 'environment' },
    })
  })

  it('maps permission denied / no camera / unsupported', () => {
    const session = createSession()
    session.openScanner()
    session.onCameraError(new DeliveryQrCameraError('permission-denied'))
    expect(session.phase.value).toBe('recoverable-error')
    expect(session.error.value?.cameraKind).toBe('permission-denied')

    session.retryAfterError()
    session.onCameraError(new DeliveryQrCameraError('no-camera'))
    expect(session.error.value?.cameraKind).toBe('no-camera')

    session.retryAfterError()
    session.onCameraError(new DeliveryQrCameraError('unsupported'))
    expect(session.phase.value).toBe('fatal-error')
  })

  it('loads preview once for duplicate decode callbacks', async () => {
    const session = createSession()
    session.openScanner()
    session.onCameraStarted()

    await Promise.all([
      session.onDecoded('same-token'),
      session.onDecoded('same-token'),
      session.onDecoded('same-token'),
    ])

    expect(previewMock).toHaveBeenCalledTimes(1)
    expect(previewMock).toHaveBeenCalledWith('same-token')
    expect(confirmMock).not.toHaveBeenCalled()
    expect(session.phase.value).toBe('preview-ready')
    expect(session.preview.value?.pharmacy.city).toBe('Amsterdam')
    expect(session.preview.value?.orders).toHaveLength(2)
    expect(session.preview.value?.totalItemQuantity).toBe(6)
  })

  it('does not call confirm when preview closes', async () => {
    const session = createSession()
    session.openScanner()
    session.onCameraStarted()
    await session.onDecoded('token-a')
    expect(session.__peekTransientTokenForTests()).toBe('token-a')
    session.closeScanner()
    expect(confirmMock).not.toHaveBeenCalled()
    expect(session.__peekTransientTokenForTests()).toBeNull()
    expect(session.phase.value).toBe('closed')
  })

  it('requires explicit final confirmation and dedupes confirm clicks', async () => {
    const session = createSession()
    session.openScanner()
    session.onCameraStarted()
    await session.onDecoded('token-b')

    session.requestMarkDelivered()
    expect(session.awaitingFinalConfirm.value).toBe(true)
    expect(confirmMock).not.toHaveBeenCalled()

    await Promise.all([
      session.confirmDelivery(),
      session.confirmDelivery(),
      session.confirmDelivery(),
    ])

    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(session.phase.value).toBe('success')
    expect(session.__peekTransientTokenForTests()).toBeNull()
    expect(onRefreshRoute).toHaveBeenCalled()
  })

  it('does not mark success on confirm failure and keeps token for retry', async () => {
    confirmMock.mockRejectedValueOnce(
      new DeliveryQrRestError(0, 'NETWORK_ERROR'),
    )
    const session = createSession()
    session.openScanner()
    session.onCameraStarted()
    await session.onDecoded('token-c')
    session.requestMarkDelivered()
    await session.confirmDelivery()

    expect(session.phase.value).toBe('preview-ready')
    expect(session.__peekTransientTokenForTests()).toBe('token-c')
    expect(session.error.value?.code).toBe('NETWORK_ERROR')
  })

  it('clears token and refreshes on consumed / already delivered', async () => {
    confirmMock.mockRejectedValueOnce(
      new DeliveryQrRestError(409, 'DELIVERY_QR_CONSUMED'),
    )
    const session = createSession()
    session.openScanner()
    session.onCameraStarted()
    await session.onDecoded('token-d')
    session.requestMarkDelivered()
    await session.confirmDelivery()

    expect(session.__peekTransientTokenForTests()).toBeNull()
    expect(onRefreshRoute).toHaveBeenCalled()
    expect(session.error.value?.code).toBe('DELIVERY_QR_CONSUMED')
  })

  it('shows recoverable confirmation-in-progress state', async () => {
    confirmMock.mockRejectedValueOnce(
      new DeliveryQrRestError(409, 'DELIVERY_QR_CONFIRMATION_IN_PROGRESS'),
    )
    const session = createSession()
    session.openScanner()
    session.onCameraStarted()
    await session.onDecoded('token-e')
    session.requestMarkDelivered()
    await session.confirmDelivery()

    expect(session.error.value?.confirmationInProgress).toBe(true)
    expect(session.phase.value).toBe('recoverable-error')
  })

  it('closes confirmation path on route inactive', async () => {
    confirmMock.mockRejectedValueOnce(
      new DeliveryQrRestError(400, 'DELIVERY_QR_ROUTE_INACTIVE'),
    )
    const session = createSession()
    session.openScanner()
    session.onCameraStarted()
    await session.onDecoded('token-f')
    session.requestMarkDelivered()
    await session.confirmDelivery()

    expect(session.error.value?.closeConfirmation).toBe(true)
    expect(session.__peekTransientTokenForTests()).toBeNull()
    expect(onRefreshRoute).toHaveBeenCalled()
  })

  it('blocks unsafe confirm retry on integrity error', async () => {
    confirmMock.mockRejectedValueOnce(
      new DeliveryQrRestError(400, 'DELIVERY_QR_ORDER_INTEGRITY_ERROR'),
    )
    const session = createSession()
    session.openScanner()
    session.onCameraStarted()
    await session.onDecoded('token-g')
    session.requestMarkDelivered()
    await session.confirmDelivery()

    expect(session.error.value?.blockConfirmRetry).toBe(true)
    expect(session.__peekTransientTokenForTests()).toBeNull()
    session.retryAfterError()
    expect(session.phase.value).toBe('preparing')
  })

  it('allows out-of-sequence stop preview (sequence is informational)', async () => {
    previewMock.mockResolvedValueOnce({
      ...previewPayload,
      stopSequence: 5,
    })
    const session = createSession()
    session.openScanner()
    session.onCameraStarted()
    await session.onDecoded('token-h')
    expect(session.preview.value?.stopSequence).toBe(5)
    expect(session.phase.value).toBe('preview-ready')
  })

  it('does not persist token in browser storage', async () => {
    const session = createSession()
    session.openScanner()
    session.onCameraStarted()
    await session.onDecoded('secret-token-value')

    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    for (let i = 0; i < localStorage.length; i += 1) {
      expect(localStorage.key(i)).not.toContain('secret-token-value')
    }
  })

  it('marks offline without opening camera', () => {
    setDeliveryQrScannerProvider({
      ...vueQrcodeReaderScannerProvider,
      isSupported: () => true,
    })
    const session = createSession()
    session.openScanner()
    session.markOffline()
    expect(session.phase.value).toBe('offline')
    expect(session.cameraActive.value).toBe(false)
  })
})
