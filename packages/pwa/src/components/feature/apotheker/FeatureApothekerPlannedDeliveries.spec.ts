/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { RouteStatus, UserRole } from '@vaccin-delivery/types'

import FeatureApothekerPlannedDeliveries from '@/components/feature/apotheker/FeatureApothekerPlannedDeliveries.vue'
import ViewBezorgerTodayRoute from '@/views/bezorger/ViewBezorgerTodayRoute.vue'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

const loadMyPlannedDeliveries = vi.fn()
const plannedDeliveries = ref<Array<Record<string, unknown>>>([])
const plannedLoading = ref(false)
const plannedError = ref<string | null>(null)

const fetchImageMock = vi.fn()
const openDeliveryStopQr = vi.fn()
const closeModal = vi.fn()
const retry = vi.fn()
const downloadQr = vi.fn()
const revokeObjectUrl = vi.fn()

const qrOpen = ref(false)
const qrContext = ref<Record<string, unknown> | null>(null)
const qrObjectUrl = ref<string | null>(null)
const qrLoading = ref(false)
const qrError = ref<string | null>(null)
const qrInactive = ref<string | null>(null)
const qrCanDownload = ref(false)
const qrDownloadFilename = ref('')

vi.mock('@/composables/useMyPlannedDeliveries', () => ({
  useMyPlannedDeliveries: () => ({
    plannedDeliveries,
    loading: plannedLoading,
    errorMessage: plannedError,
    hasPlannedDeliveries: ref(false),
    loadMyPlannedDeliveries,
  }),
}))

vi.mock('@/composables/useDeliveryStopQrDisplay', () => ({
  useDeliveryStopQrDisplay: () => ({
    open: qrOpen,
    context: qrContext,
    objectUrl: qrObjectUrl,
    loading: qrLoading,
    errorMessage: qrError,
    inactiveMessage: qrInactive,
    canDownload: qrCanDownload,
    downloadFilename: qrDownloadFilename,
    openDeliveryStopQr,
    closeModal,
    retry,
    downloadQr,
    revokeObjectUrl,
  }),
}))

vi.mock('@/api/delivery-stop-qr-image-rest', () => ({
  fetchDeliveryStopQrImage: (...args: unknown[]) => fetchImageMock(...args),
  buildDeliveryStopQrDownloadFilename: (
    routeDate: string,
    stopSequence: number,
  ) => `delivery-qr-${routeDate}-stop-${stopSequence}.svg`,
  downloadDeliveryStopQrSvg: vi.fn(),
}))

vi.mock('@/composables/useGraphQL', () => ({
  default: () => ({ apolloClient: { query: vi.fn() } }),
  registerReconnectHandler: () => () => undefined,
}))

vi.mock('@/composables/useOrders', () => ({
  useOrders: () => ({
    myOrders: ref([]),
    loading: ref(false),
    errorMessage: ref(null),
    loadMyOrders: vi.fn(),
    loadWeeklySummary: vi.fn(),
    cancelOwnOrder: vi.fn(),
    subscribeToMyOrderEvents: vi.fn(),
    stopMyOrderSubscriptions: vi.fn(),
    isOrderCannotBeCancelledError: () => false,
  }),
}))

vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({
    subscribeToNotificationEvents: vi.fn(),
    stopNotificationSubscription: vi.fn(),
  }),
}))

vi.mock('@/composables/useDeliveryRoutes', () => ({
  RouteStatus,
  useDeliveryRoutes: () => ({
    myTodayRoute: ref(null),
    loading: ref(false),
    updatingStatus: ref(false),
    errorMessage: ref(null),
    statusError: ref(null),
    loadMyTodayRoute: vi.fn(),
    updateRouteStatus: vi.fn(),
    subscribeToTodayRouteUpdates: vi.fn(),
    stopTodayRouteSubscription: vi.fn(),
    formatAddress: () => 'addr',
    formatStatusHistoryEntry: () => 'history',
  }),
}))

vi.mock('@/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({
    currentUser: ref({ role: UserRole.Bezorger }),
  }),
  mapGraphQLError: (error: unknown) => String(error),
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

function makeDelivery(overrides?: Partial<Record<string, unknown>>) {
  return {
    routeId: 'route-1',
    stopId: 'stop-1',
    routeDate: '2026-07-26',
    routeStatus: RouteStatus.Assigned,
    stopSequence: 1,
    pharmacyName: 'Apotheek Centrum',
    address: {
      street: 'Hoofdstraat',
      houseNumber: '1',
      postalCode: '1000',
      city: 'Brussel',
      country: 'BE',
    },
    orderCount: 2,
    orderIds: ['ord-1', 'ord-2'],
    orders: [
      {
        orderId: 'ord-1',
        status: 'PLANNED',
        lines: [{ vaccineId: 'v1', vaccineName: 'Flu', quantity: 3 }],
      },
      {
        orderId: 'ord-2',
        status: 'PLANNED',
        lines: [{ vaccineId: 'v2', vaccineName: 'Covid', quantity: 2 }],
      },
    ],
    totalLineCount: 2,
    totalQuantity: 5,
    qrAvailable: true,
    qrConsumed: false,
    deliveredAt: null,
    qrImagePath: '/delivery-routes/route-1/stops/stop-1/qr',
    ...overrides,
  }
}

const uiStubs = {
  UCard: { template: '<div><slot /><slot name="header" /></div>' },
  UButton: {
    props: ['ariaLabel'],
    template:
      '<button type="button" :aria-label="ariaLabel" @click="$attrs.onClick?.($event) || $emit(\'click\', $event)"><slot /></button>',
  },
  UBadge: { template: '<span><slot /></span>' },
  UAlert: { template: '<div><slot /></div>' },
  UModal: {
    props: ['open', 'title'],
    template:
      '<div v-if="open" data-testid="delivery-stop-qr-modal"><slot name="body" /><slot name="footer" /></div>',
  },
  CommonLoadingSkeleton: {
    template: '<div data-testid="planned-deliveries-loading" />',
  },
  CommonErrorState: { template: '<div data-testid="error" />' },
  CommonEmptyState: { template: '<div data-testid="empty" />' },
  FeatureDeliveryStopQrModal: {
    props: [
      'open',
      'context',
      'objectUrl',
      'loading',
      'errorMessage',
      'inactiveMessage',
      'canDownload',
      'downloadFilename',
    ],
    template:
      '<div v-if="open" data-testid="delivery-stop-qr-modal">modal</div>',
  },
}

describe('FeatureApothekerPlannedDeliveries', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
    plannedDeliveries.value = []
    plannedLoading.value = false
    plannedError.value = null
    loadMyPlannedDeliveries.mockReset()
    openDeliveryStopQr.mockReset()
    qrOpen.value = false
    qrContext.value = null
    qrObjectUrl.value = null
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('renders one delivery card per generated stop with a single QR button', async () => {
    plannedDeliveries.value = [makeDelivery()]

    const wrapper = mount(FeatureApothekerPlannedDeliveries, {
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })
    await flushPromises()

    expect(wrapper.findAll('[data-testid="planned-delivery-card"]')).toHaveLength(
      1,
    )
    expect(wrapper.findAll('[data-testid="show-delivery-qr"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-testid="planned-delivery-order-ref"]')).toHaveLength(
      2,
    )
    expect(wrapper.text()).toContain(translate('deliveryStopQr.planned.cardTitle'))
  })

  it('groups two orders in one stop into one card', async () => {
    plannedDeliveries.value = [
      makeDelivery({
        orderCount: 2,
        orderIds: ['ord-1', 'ord-2'],
      }),
    ]

    const wrapper = mount(FeatureApothekerPlannedDeliveries, {
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })
    await flushPromises()

    expect(wrapper.findAll('[data-testid="planned-delivery-card"]')).toHaveLength(
      1,
    )
    expect(wrapper.findAll('[data-testid="show-delivery-qr"]')).toHaveLength(1)
  })

  it('does not include unrelated stops', async () => {
    plannedDeliveries.value = [makeDelivery({ stopId: 'stop-mine' })]

    const wrapper = mount(FeatureApothekerPlannedDeliveries, {
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })
    await flushPromises()

    expect(wrapper.find('[data-stop-id="stop-other"]').exists()).toBe(false)
    expect(wrapper.find('[data-stop-id="stop-mine"]').exists()).toBe(true)
  })

  it('shows QR action for ASSIGNED and IN_PROGRESS', async () => {
    plannedDeliveries.value = [
      makeDelivery({ routeStatus: RouteStatus.Assigned }),
    ]
    let wrapper = mount(FeatureApothekerPlannedDeliveries, {
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="show-delivery-qr"]').exists()).toBe(true)
    wrapper.unmount()

    plannedDeliveries.value = [
      makeDelivery({ routeStatus: RouteStatus.InProgress }),
    ]
    wrapper = mount(FeatureApothekerPlannedDeliveries, {
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="show-delivery-qr"]').exists()).toBe(true)
  })

  it('shows confirmed state when consumed', async () => {
    plannedDeliveries.value = [
      makeDelivery({
        qrAvailable: false,
        qrConsumed: true,
        qrImagePath: null,
      }),
    ]

    const wrapper = mount(FeatureApothekerPlannedDeliveries, {
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="show-delivery-qr"]').exists()).toBe(false)
    expect(
      wrapper.find('[data-testid="planned-delivery-confirmed"]').exists(),
    ).toBe(true)
  })

  it('shows unavailable for legacy stops without QR', async () => {
    plannedDeliveries.value = [
      makeDelivery({
        stopId: null,
        qrAvailable: false,
        qrConsumed: false,
        qrImagePath: null,
      }),
    ]

    const wrapper = mount(FeatureApothekerPlannedDeliveries, {
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="show-delivery-qr"]').exists()).toBe(false)
    expect(
      wrapper.find('[data-testid="planned-delivery-unavailable"]').text(),
    ).toContain(translate('deliveryStopQr.state.unavailable'))
  })

  it('opens the QR modal workflow when Show delivery QR is clicked', async () => {
    plannedDeliveries.value = [makeDelivery()]

    const wrapper = mount(FeatureApothekerPlannedDeliveries, {
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })
    await flushPromises()

    await wrapper.get('[data-testid="show-delivery-qr"]').trigger('click')
    await nextTick()

    expect(openDeliveryStopQr).toHaveBeenCalledTimes(1)
    const firstCall = openDeliveryStopQr.mock.calls[0]
    expect(firstCall).toBeDefined()
    const arg = firstCall?.[0] as {
      routeId: string
      stopId: string
      pharmacyName: string
      orders: unknown[]
    }
    expect(arg.routeId).toBe('route-1')
    expect(arg.stopId).toBe('stop-1')
    expect(arg.pharmacyName).toBe('Apotheek Centrum')
    expect(arg.orders).toHaveLength(2)
  })
})

describe('courier display QR isolation', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('does not render pharmacist/admin display QR UI on courier route view', async () => {
    const wrapper = mount(ViewBezorgerTodayRoute, {
      global: {
        plugins: [createTestI18n('en')],
        stubs: {
          ...uiStubs,
          CommonRealtimeStatus: true,
          FeatureBezorgerDeliveryQrWorkflow: true,
        },
      },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="show-delivery-qr"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="admin-view-delivery-qr"]').exists()).toBe(
      false,
    )
    expect(wrapper.find('[data-testid="planned-deliveries-section"]').exists()).toBe(
      false,
    )
    wrapper.unmount()
  })
})
