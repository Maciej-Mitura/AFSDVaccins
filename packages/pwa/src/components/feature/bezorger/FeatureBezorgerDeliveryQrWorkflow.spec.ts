/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { RouteStatus, UserRole } from '@vaccin-delivery/types'

import FeatureBezorgerDeliveryQrWorkflow from '@/components/feature/bezorger/FeatureBezorgerDeliveryQrWorkflow.vue'
import FeatureBezorgerDeliveryQrCamera from '@/components/feature/bezorger/FeatureBezorgerDeliveryQrCamera.vue'
import ViewBezorgerTodayRoute from '@/views/bezorger/ViewBezorgerTodayRoute.vue'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'
import {
  __resetOnlineStatusForTests,
  useOnlineStatus,
} from '@/composables/useOnlineStatus'
import { stopMediaStreamTracks } from '@/composables/delivery-qr/delivery-qr-scanner-provider'

const previewMock = vi.fn()
const confirmMock = vi.fn()
const loadMyTodayRoute = vi.fn()
const myTodayRoute = ref<Record<string, unknown> | null>(null)
const currentUser = ref<{ role: UserRole } | null>({
  role: UserRole.Bezorger,
})

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

vi.mock('vue-qrcode-reader', () => ({
  QrcodeStream: {
    name: 'QrcodeStream',
    props: ['constraints', 'paused', 'formats'],
    emits: ['camera-on', 'detect', 'error'],
    template: '<div data-testid="qrcode-stream-stub"><slot /></div>',
    mounted() {
      // Do not auto-start — permission only after user opens scanner.
    },
  },
}))

vi.mock('@/composables/useDeliveryRoutes', () => ({
  RouteStatus,
  useDeliveryRoutes: () => ({
    myTodayRoute,
    loading: ref(false),
    updatingStatus: ref(false),
    errorMessage: ref(null),
    statusError: ref(null),
    loadMyTodayRoute,
    updateRouteStatus: vi.fn(),
    subscribeToTodayRouteUpdates: vi.fn(),
    stopTodayRouteSubscription: vi.fn(),
    formatAddress: () => 'Hoofdstraat 1, 1000AA Amsterdam',
    formatStatusHistoryEntry: () => 'history',
  }),
}))

vi.mock('@/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({ currentUser }),
}))

vi.mock('@/composables/useRealtimeConnection', () => ({
  useRealtimeConnection: () => ({ connectionState: ref('connected') }),
}))

vi.mock('vue-router', async () => {
  const actual =
    await vi.importActual<typeof import('vue-router')>('vue-router')
  return {
    ...actual,
    onBeforeRouteLeave: vi.fn(),
  }
})

const previewPayload = {
  routeId: 'route-1',
  stopId: 'stop-1',
  routeDate: '2026-07-26',
  routeStatus: 'IN_PROGRESS',
  stopSequence: 1,
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

const uiStubs = {
  UButton: {
    props: ['loading', 'disabled', 'block', 'size', 'color', 'variant'],
    emits: ['click'],
    template:
      '<button type="button" :disabled="disabled" :aria-label="$attrs[\'aria-label\']" :data-testid="$attrs[\'data-testid\']" @click="$emit(\'click\')"><slot /></button>',
  },
  UAlert: {
    props: ['title', 'description', 'color'],
    template:
      '<div :data-testid="$attrs[\'data-testid\']"><p>{{ title }}</p><p>{{ description }}</p><slot /></div>',
  },
  UModal: {
    props: ['open', 'title'],
    emits: ['update:open'],
    template:
      '<div v-if="open" data-testid="modal-stub"><h2>{{ title }}</h2><slot name="body" /><slot name="footer" /></div>',
  },
  UInput: {
    props: ['modelValue', 'maxlength', 'type'],
    emits: ['update:modelValue'],
    template:
      '<input :value="modelValue" :maxlength="maxlength" :type="type" :data-testid="$attrs[\'data-testid\']" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  CommonEmptyState: { template: '<div />' },
  CommonErrorState: { template: '<div />' },
  CommonLoadingSkeleton: { template: '<div />' },
}

function makeRoute(status: RouteStatus) {
  return {
    id: 'route-1',
    routeTemplateId: 'tpl-1',
    bezorgerProfileId: 'bez-1',
    deliveryDate: '2026-07-26',
    status,
    stops: [
      {
        stopId: 'stop-1',
        sequence: 1,
        apothekerProfileId: 'aph-1',
        apothekerUserId: 'user-aph',
        pharmacyName: 'Apotheek Centrum',
        address: {
          street: 'Hoofdstraat',
          houseNumber: '1',
          postalCode: '1000AA',
          city: 'Amsterdam',
          country: 'NL',
        },
        orderIds: ['ord-1'],
        orderCount: 1,
        totalQuantity: 3,
        lines: [
          {
            vaccineId: 'v1',
            vaccineName: 'Vaccine A',
            manufacturer: 'M',
            quantity: 3,
          },
        ],
        qrAvailable: true,
        qrConsumed: false,
        deliveredAt: null,
      },
    ],
    skippedApothekerProfileIds: [],
    statusHistory: [],
    generatedAt: '2026-07-26T00:00:00.000Z',
    generatedByUserId: 'admin',
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z',
  }
}

describe('delivery QR scanner UI', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
    __resetOnlineStatusForTests()
    useOnlineStatus()
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
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    })
    window.dispatchEvent(new Event('online'))
    previewMock.mockReset()
    confirmMock.mockReset()
    loadMyTodayRoute.mockReset()
    loadMyTodayRoute.mockResolvedValue(undefined)
    previewMock.mockResolvedValue(previewPayload)
    confirmMock.mockResolvedValue({
      routeId: 'route-1',
      stopId: 'stop-1',
      deliveredAt: '2026-07-26T10:00:00.000Z',
      deliveredByUserId: 'user-1',
      orderIds: ['ord-1', 'ord-2'],
      orderCount: 2,
      recipientCity: 'Amsterdam',
      proofMethod: 'QR_SCAN',
      routeStatus: 'IN_PROGRESS',
      remainingStopCount: 0,
    })
    currentUser.value = { role: UserRole.Bezorger }
    myTodayRoute.value = makeRoute(RouteStatus.InProgress)
  })

  afterEach(() => {
    __resetOnlineStatusForTests()
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    vi.clearAllMocks()
  })

  it('shows scan action for BEZORGER with IN_PROGRESS route', async () => {
    const wrapper = mount(ViewBezorgerTodayRoute, {
      global: {
        plugins: [createTestI18n('en')],
        stubs: uiStubs,
      },
    })
    await nextTick()
    const button = wrapper.find('[data-testid="delivery-qr-scan-action"]')
    expect(button.exists()).toBe(true)
    expect(button.text()).toContain(translate('bezorger.route.qr.scan'))
    expect(button.attributes('aria-label')).toBe(
      translate('bezorger.route.qr.scan'),
    )
  })

  it('hides scan action for non-couriers', async () => {
    currentUser.value = { role: UserRole.Admin }
    const wrapper = mount(ViewBezorgerTodayRoute, {
      global: {
        plugins: [createTestI18n('en')],
        stubs: uiStubs,
      },
    })
    await nextTick()
    expect(
      wrapper.find('[data-testid="delivery-qr-scan-action"]').exists(),
    ).toBe(false)
  })

  it('does not enable scanner for ASSIGNED / COMPLETED / CANCELLED', async () => {
    for (const status of [
      RouteStatus.Assigned,
      RouteStatus.Completed,
      RouteStatus.Cancelled,
    ]) {
      myTodayRoute.value = makeRoute(status)
      const wrapper = mount(ViewBezorgerTodayRoute, {
        global: {
          plugins: [createTestI18n('en')],
          stubs: uiStubs,
        },
      })
      await nextTick()
      expect(
        wrapper.find('[data-testid="delivery-qr-scan-action"]').exists(),
      ).toBe(false)
      wrapper.unmount()
    }
  })

  it('keeps existing start/complete route controls intact', async () => {
    myTodayRoute.value = makeRoute(RouteStatus.Assigned)
    const assigned = mount(ViewBezorgerTodayRoute, {
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })
    await nextTick()
    expect(assigned.find('[data-testid="route-start"]').exists()).toBe(true)

    myTodayRoute.value = makeRoute(RouteStatus.InProgress)
    const inProgress = mount(ViewBezorgerTodayRoute, {
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })
    await nextTick()
    expect(inProgress.find('[data-testid="route-complete"]').exists()).toBe(
      true,
    )
    expect(inProgress.find('[data-testid="route-stop"]').exists()).toBe(true)
  })

  it('prevents opening camera when offline and updates on offline event', async () => {
    const wrapper = mount(FeatureBezorgerDeliveryQrWorkflow, {
      props: {
        enabled: true,
        onRefreshRoute: loadMyTodayRoute,
      },
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })
    window.dispatchEvent(new Event('offline'))
    await nextTick()

    const button = wrapper.find('[data-testid="delivery-qr-scan-action"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(
      wrapper.find('[data-testid="delivery-qr-offline-hint"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="delivery-qr-scanner-panel"]').exists(),
    ).toBe(false)
  })

  it('requests camera only after user opens scanner', async () => {
    const wrapper = mount(FeatureBezorgerDeliveryQrWorkflow, {
      props: {
        enabled: true,
        onRefreshRoute: loadMyTodayRoute,
      },
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })

    expect(wrapper.find('[data-testid="qrcode-stream-stub"]').exists()).toBe(
      false,
    )

    await wrapper
      .find('[data-testid="delivery-qr-scan-action"]')
      .trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="qrcode-stream-stub"]').exists()).toBe(
      true,
    )
    expect(
      wrapper.find('[data-testid="delivery-qr-camera-explanation"]').text(),
    ).toContain(translate('bezorger.route.qr.camera.explanation'))
  })

  it('passes rear-facing camera constraints', async () => {
    const wrapper = mount(FeatureBezorgerDeliveryQrWorkflow, {
      props: {
        enabled: true,
        onRefreshRoute: loadMyTodayRoute,
      },
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })
    await wrapper
      .find('[data-testid="delivery-qr-scan-action"]')
      .trigger('click')
    await nextTick()

    const camera = wrapper.findComponent(FeatureBezorgerDeliveryQrCamera)
    expect(camera.exists()).toBe(true)
    expect(['preparing', 'requesting-permission', 'scanning']).toContain(
      camera.props('phase'),
    )
    expect(
      wrapper.find('[data-testid="delivery-qr-camera-viewport"]').exists(),
    ).toBe(true)
    const { DELIVERY_QR_DEFAULT_CONSTRAINTS } =
      await import('@/composables/delivery-qr/delivery-qr-scanner-provider')
    expect(DELIVERY_QR_DEFAULT_CONSTRAINTS).toEqual({
      facingMode: { ideal: 'environment' },
    })
  })

  it('stops tracks helper clears media tracks', () => {
    const stop = vi.fn()
    const stream = {
      getTracks: () => [{ stop }, { stop }],
    } as unknown as MediaStream
    stopMediaStreamTracks(stream)
    expect(stop).toHaveBeenCalledTimes(2)
  })

  async function submitManualToken(
    wrapper: ReturnType<typeof mount>,
    token: string,
  ): Promise<void> {
    const camera = wrapper.findComponent(FeatureBezorgerDeliveryQrCamera)
    expect(camera.exists()).toBe(true)
    camera.vm.submitDecodedToken(token)
    await flushPromises()
    await nextTick()
  }

  it('opens preview modal after successful preview and shows pharmacy/orders/totals', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const wrapper = mount(FeatureBezorgerDeliveryQrWorkflow, {
      attachTo: host,
      props: {
        enabled: true,
        onRefreshRoute: loadMyTodayRoute,
      },
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })

    await wrapper
      .find('[data-testid="delivery-qr-scan-action"]')
      .trigger('click')
    await nextTick()
    await submitManualToken(wrapper, 'preview-token')

    expect(previewMock.mock.calls).toEqual([['preview-token']])
    expect(confirmMock).not.toHaveBeenCalled()

    const pharmacy = document.querySelector(
      '[data-testid="delivery-qr-pharmacy-name"]',
    )
    expect(pharmacy?.textContent).toBe('Apotheek Centrum')
    expect(
      document.querySelector('[data-testid="delivery-qr-pharmacy-address"]')
        ?.textContent,
    ).toContain('Hoofdstraat 1')
    expect(
      document.querySelector('[data-testid="delivery-qr-pharmacy-city"]')
        ?.textContent,
    ).toContain('Amsterdam')
    expect(
      document.querySelectorAll('[data-testid="delivery-qr-order"]').length,
    ).toBe(2)
    expect(
      document.querySelectorAll('[data-testid="delivery-qr-order-line"]')
        .length,
    ).toBeGreaterThan(1)
    expect(
      document.querySelector('[data-testid="delivery-qr-total-quantity"]')
        ?.textContent,
    ).toContain('6')
    expect(
      document.querySelector('[data-testid="delivery-qr-scan-not-delivered"]'),
    ).not.toBeNull()

    wrapper.unmount()
    host.remove()
  })

  it('requires explicit confirmation and refreshes on success', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const wrapper = mount(FeatureBezorgerDeliveryQrWorkflow, {
      attachTo: host,
      props: {
        enabled: true,
        onRefreshRoute: loadMyTodayRoute,
      },
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })

    await wrapper
      .find('[data-testid="delivery-qr-scan-action"]')
      .trigger('click')
    await nextTick()
    await submitManualToken(wrapper, 'confirm-token')

    const markDelivered = document.querySelector(
      '[data-testid="delivery-qr-mark-delivered"]',
    )
    expect(markDelivered).not.toBeNull()
    ;(markDelivered as HTMLButtonElement).click()
    await nextTick()
    expect(confirmMock).not.toHaveBeenCalled()
    expect(
      document.querySelector('[data-testid="delivery-qr-final-confirm"]'),
    ).not.toBeNull()

    const confirmBtn = document.querySelector(
      '[data-testid="delivery-qr-confirm-delivery"]',
    ) as HTMLButtonElement
    confirmBtn.click()
    confirmBtn.click()
    await flushPromises()

    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(loadMyTodayRoute).toHaveBeenCalled()
    expect(
      document.querySelector('[data-testid="delivery-qr-success"]'),
    ).not.toBeNull()

    wrapper.unmount()
    host.remove()
  })

  it('uses i18n keys for user-visible scanner text', () => {
    const wrapper = mount(FeatureBezorgerDeliveryQrWorkflow, {
      props: {
        enabled: true,
        onRefreshRoute: loadMyTodayRoute,
      },
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })
    expect(wrapper.text()).toContain(translate('bezorger.route.qr.scan'))
  })

  it('keeps scanner usable on a narrow viewport', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 360,
    })
    const wrapper = mount(FeatureBezorgerDeliveryQrWorkflow, {
      props: {
        enabled: true,
        onRefreshRoute: loadMyTodayRoute,
      },
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })
    await wrapper
      .find('[data-testid="delivery-qr-scan-action"]')
      .trigger('click')
    await nextTick()
    expect(
      wrapper.find('[data-testid="delivery-qr-scanner-panel"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="delivery-qr-camera-viewport"]').exists(),
    ).toBe(true)
  })

  it('stops camera tracks on close and unmount', async () => {
    const stop = vi.fn()
    const stream = {
      getTracks: () => [{ stop }],
    } as unknown as MediaStream

    const wrapper = mount(FeatureBezorgerDeliveryQrWorkflow, {
      props: {
        enabled: true,
        onRefreshRoute: loadMyTodayRoute,
      },
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })
    await wrapper
      .find('[data-testid="delivery-qr-scan-action"]')
      .trigger('click')
    await nextTick()

    const camera = wrapper.findComponent(FeatureBezorgerDeliveryQrCamera)
    camera.vm.onCameraOn(stream)
    await nextTick()
    await wrapper
      .find('[data-testid="delivery-qr-close-scanner"]')
      .trigger('click')
    expect(stop).toHaveBeenCalled()

    await wrapper
      .find('[data-testid="delivery-qr-scan-action"]')
      .trigger('click')
    await nextTick()
    const camera2 = wrapper.findComponent(FeatureBezorgerDeliveryQrCamera)
    const stop2 = vi.fn()
    const stream2 = {
      getTracks: () => [{ stop: stop2 }],
    } as unknown as MediaStream
    camera2.vm.onCameraOn(stream2)
    wrapper.unmount()
    expect(stop2).toHaveBeenCalled()
  })
})
