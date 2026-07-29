/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { RouteStatus, UserRole } from '@vaccin-delivery/types'

import ViewBezorgerTodayRoute from '@/views/bezorger/ViewBezorgerTodayRoute.vue'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'
import {
  __resetOnlineStatusForTests,
  useOnlineStatus,
} from '@/composables/useOnlineStatus'

const loadMyTodayRoute = vi.fn()
const myTodayRoute = ref<Record<string, unknown> | null>(null)
const todayRouteSource = ref('SERVER')
const todayRouteIsReadOnly = ref(false)
const todayRouteCachedAt = ref<string | null>(null)
const todayRouteRefreshError = ref<string | null>(null)
const errorMessage = ref<string | null>(null)
const isOnline = ref(true)
const currentUser = ref<{
  id: string
  role: UserRole
  bezorgerProfile?: { id: string }
} | null>({
  id: 'user-1',
  role: UserRole.Bezorger,
  bezorgerProfile: { id: 'bez-1' },
})

const arrivalVm = ref({
  state: 'idle',
  canMarkArrived: false,
  canCancelPending: false,
  canRetry: false,
  canDiscard: false,
  clientArrivedAt: null as string | null,
  recordedAt: null as string | null,
  pendingActionId: null as string | null,
  errorCode: null as string | null,
  stopId: 'stop-1',
})

vi.mock('@/composables/useDeliveryRoutes', () => ({
  RouteStatus,
  useDeliveryRoutes: () => ({
    myTodayRoute,
    loading: ref(false),
    refreshing: ref(false),
    updatingStatus: ref(false),
    errorMessage,
    statusError: ref(null),
    todayRouteSource,
    todayRouteCachedAt,
    todayRouteRefreshError,
    todayRouteIsReadOnly,
    isOnline,
    loadMyTodayRoute,
    updateRouteStatus: vi.fn(),
    subscribeToTodayRouteUpdates: vi.fn(),
    stopTodayRouteSubscription: vi.fn(),
    formatAddress: (stop: { address: { city: string } }) =>
      `Street 1, 1000 ${stop.address.city}`,
    formatStatusHistoryEntry: () => 'history',
  }),
}))

vi.mock('@/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({ currentUser, initialized: ref(true) }),
}))

vi.mock('@/composables/useRealtimeConnection', () => ({
  useRealtimeConnection: () => ({ connectionState: ref('connected') }),
}))

vi.mock('@/composables/useDeliveryManifestDownload', () => ({
  useDeliveryManifestDownload: () => ({
    loading: ref(false),
    errorMessage: ref(null),
    successMessage: ref(null),
    clearFeedback: vi.fn(),
    downloadRouteManifest: vi.fn(),
    downloadStopManifest: vi.fn(),
  }),
}))

vi.mock('@/composables/useCourierStopArrival', () => ({
  useCourierStopArrival: () => ({
    viewModelForStop: () => arrivalVm.value,
    feedbackMessage: ref(null),
    feedbackTone: ref(null),
    reloadPendingActions: vi.fn(),
    markArrived: vi.fn(),
    cancelPending: vi.fn(),
    discardPending: vi.fn(),
    retrySync: vi.fn(),
    syncOnReconnect: vi.fn(),
  }),
}))

vi.mock('vue-router', async () => {
  const actual =
    await vi.importActual<typeof import('vue-router')>('vue-router')
  return {
    ...actual,
    onBeforeRouteLeave: vi.fn(),
  }
})

vi.mock(
  '@/components/feature/voice-report/FeatureRouteVoiceRecorder.vue',
  () => ({
    default: {
      name: 'FeatureRouteVoiceRecorder',
      template: '<section data-testid="route-voice-reports-section" />',
    },
  }),
)

vi.mock(
  '@/components/feature/bezorger/FeatureBezorgerDeliveryQrWorkflow.vue',
  () => ({
    default: {
      name: 'FeatureBezorgerDeliveryQrWorkflow',
      template: '<div data-testid="delivery-qr-workflow" />',
    },
  }),
)

vi.mock(
  '@/components/feature/routes/FeatureRouteLocationStatusCard.vue',
  () => ({
    default: {
      name: 'FeatureRouteLocationStatusCard',
      props: ['variant'],
      template:
        '<div data-testid="route-location-status-card" :data-variant="variant" />',
    },
  }),
)

const uiStubs = {
  UButton: {
    props: ['loading', 'disabled', 'block', 'size', 'color', 'variant'],
    emits: ['click'],
    template:
      '<button type="button" :disabled="disabled" :data-testid="$attrs[\'data-testid\']" @click="$emit(\'click\')"><slot /></button>',
  },
  UAlert: {
    props: ['title', 'description', 'color'],
    template:
      '<div :data-testid="$attrs[\'data-testid\']"><p>{{ title }}</p><slot name="actions" /></div>',
  },
  UBadge: { template: '<span><slot /></span>' },
  UIcon: { template: '<span />' },
  CommonEmptyState: {
    props: ['title', 'description'],
    template:
      '<div data-testid="empty-state"><p>{{ title }}</p><p>{{ description }}</p></div>',
  },
  CommonErrorState: { template: '<div data-testid="error-state" />' },
  CommonLoadingSkeleton: { template: '<div data-testid="loading" />' },
  CommonPageHeader: {
    props: ['title', 'subtitle', 'meta'],
    template:
      '<header data-testid="common-page-header"><h1>{{ title }}</h1><slot name="actions" /></header>',
  },
  CommonPageSection: {
    props: ['title', 'variant'],
    template:
      '<section data-testid="common-page-section"><h2 v-if="title">{{ title }}</h2><div data-testid="common-page-section-body"><slot /></div></section>',
  },
}

function makeStop(overrides: Record<string, unknown> = {}) {
  return {
    stopId: 'stop-1',
    sequence: 1,
    apothekerProfileId: 'apo-1',
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
    totalQuantity: 12,
    lines: [{ vaccineId: 'v1', vaccineName: 'Vac A', quantity: 12 }],
    qrConsumed: false,
    deliveredAt: null,
    ...overrides,
  }
}

function makeRoute(
  status: RouteStatus,
  stops: Record<string, unknown>[] = [makeStop()],
) {
  return {
    id: 'route-1',
    routeTemplateId: 'tpl-1',
    bezorgerProfileId: 'bez-1',
    deliveryDate: '2026-07-29',
    status,
    locationStatus: {
      hasLocation: false,
      city: null,
      recordedAt: null,
      source: null,
      stopSequence: null,
      hasNextStop: false,
      nextStop: null,
    },
    stops,
    skippedApothekerProfileIds: [],
    statusHistory: [],
    generatedAt: '2026-07-29T00:00:00.000Z',
    generatedByUserId: 'admin',
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
  }
}

function mountPage() {
  return mount(ViewBezorgerTodayRoute, {
    global: {
      plugins: [createTestI18n('en')],
      stubs: uiStubs,
    },
  })
}

describe('ViewBezorgerTodayRoute Phase 35G5', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
    __resetOnlineStatusForTests()
    useOnlineStatus()
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    })
    window.dispatchEvent(new Event('online'))
    loadMyTodayRoute.mockReset()
    loadMyTodayRoute.mockResolvedValue(undefined)
    currentUser.value = {
      id: 'user-1',
      role: UserRole.Bezorger,
      bezorgerProfile: { id: 'bez-1' },
    }
    todayRouteSource.value = 'SERVER'
    todayRouteIsReadOnly.value = false
    todayRouteCachedAt.value = null
    todayRouteRefreshError.value = null
    errorMessage.value = null
    isOnline.value = true
    arrivalVm.value = {
      state: 'idle',
      canMarkArrived: false,
      canCancelPending: false,
      canRetry: false,
      canDiscard: false,
      clientArrivedAt: null,
      recordedAt: null,
      pendingActionId: null,
      errorCode: null,
      stopId: 'stop-1',
    }
    myTodayRoute.value = makeRoute(RouteStatus.Assigned)
  })

  afterEach(() => {
    __resetOnlineStatusForTests()
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('shows ASSIGNED state with dominant start action and next stop', async () => {
    const wrapper = mountPage()
    await nextTick()
    expect(wrapper.find('[data-testid="route-status"]').text()).toBe(
      translate('status.route.assigned'),
    )
    expect(wrapper.find('[data-testid="route-start"]').exists()).toBe(true)
    expect(
      wrapper.find('[data-testid="route-current-stop-section"]').text(),
    ).toContain('Apotheek Centrum')
    expect(wrapper.find('[data-testid="delivery-qr-workflow"]').exists()).toBe(
      false,
    )
  })

  it('shows IN_PROGRESS with QR, mark-arrived and blocked complete until delivered', async () => {
    arrivalVm.value = {
      ...arrivalVm.value,
      state: 'mark',
      canMarkArrived: true,
    }
    myTodayRoute.value = makeRoute(RouteStatus.InProgress)
    const wrapper = mountPage()
    await nextTick()
    expect(wrapper.find('[data-testid="route-status"]').text()).toBe(
      translate('status.route.inProgress'),
    )
    expect(
      wrapper.find('[data-testid="route-stop-mark-arrived"]').exists(),
    ).toBe(true)
    expect(wrapper.find('[data-testid="delivery-qr-workflow"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="route-complete"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="route-complete-blocked"]').exists()).toBe(
      true,
    )
    expect(
      wrapper.find('[data-testid="route-complete"]').attributes('disabled'),
    ).toBeDefined()
  })

  it('enables complete after all deliverable stops are confirmed', async () => {
    myTodayRoute.value = makeRoute(RouteStatus.InProgress, [
      makeStop({
        qrConsumed: true,
        deliveredAt: '2026-07-29T10:00:00.000Z',
      }),
    ])
    const wrapper = mountPage()
    await nextTick()
    expect(wrapper.find('[data-testid="route-complete-blocked"]').exists()).toBe(
      false,
    )
    expect(
      wrapper.find('[data-testid="route-complete"]').attributes('disabled'),
    ).toBeUndefined()
  })

  it('shows arrived next-step after arrival confirmation', async () => {
    arrivalVm.value = {
      ...arrivalVm.value,
      state: 'confirmed',
      canMarkArrived: false,
      clientArrivedAt: '2026-07-29T09:00:00.000Z',
      recordedAt: '2026-07-29T09:00:01.000Z',
    }
    myTodayRoute.value = makeRoute(RouteStatus.InProgress, [
      makeStop({
        arrival: {
          clientArrivedAt: '2026-07-29T09:00:00.000Z',
          recordedAt: '2026-07-29T09:00:01.000Z',
        },
      }),
    ])
    const wrapper = mountPage()
    await nextTick()
    expect(
      wrapper.find('[data-testid="route-stop-arrived-next-step"]').exists(),
    ).toBe(true)
    expect(wrapper.find('[data-testid="route-stop-qr-dominant"]').exists()).toBe(
      true,
    )
  })

  it('shows COMPLETED and CANCELLED without primary delivery actions', async () => {
    myTodayRoute.value = makeRoute(RouteStatus.Completed, [
      makeStop({ qrConsumed: true, deliveredAt: '2026-07-29T10:00:00.000Z' }),
    ])
    let wrapper = mountPage()
    await nextTick()
    expect(wrapper.find('[data-testid="route-start"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="route-complete"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="route-status"]').text()).toBe(
      translate('status.route.completed'),
    )

    myTodayRoute.value = makeRoute(RouteStatus.Cancelled)
    wrapper = mountPage()
    await nextTick()
    expect(wrapper.find('[data-testid="route-status"]').text()).toBe(
      translate('status.route.cancelled'),
    )
    expect(wrapper.find('[data-testid="route-start"]').exists()).toBe(false)
  })

  it('shows empty state when no route', async () => {
    myTodayRoute.value = null
    const wrapper = mountPage()
    await nextTick()
    expect(wrapper.find('[data-testid="empty-state"]').text()).toContain(
      translate('bezorger.route.today.empty.title'),
    )
  })

  it('shows cached/offline sync banners', async () => {
    todayRouteSource.value = 'CACHE'
    todayRouteIsReadOnly.value = true
    todayRouteCachedAt.value = '2026-07-29T08:00:00.000Z'
    myTodayRoute.value = makeRoute(RouteStatus.InProgress)
    const wrapper = mountPage()
    await nextTick()
    expect(wrapper.find('[data-testid="offline-route-banner"]').exists()).toBe(
      true,
    )
    expect(
      wrapper.find('[data-testid="offline-route-cached-at"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="offline-actions-disabled-reason"]').exists(),
    ).toBe(true)
    expect(
      wrapper
        .find('[data-testid="route-location-status-card"]')
        .attributes('data-variant'),
    ).toBe('inset')
  })

  it('renders expandable stop details with aria-expanded', async () => {
    myTodayRoute.value = makeRoute(RouteStatus.Assigned, [
      makeStop(),
      makeStop({
        stopId: 'stop-2',
        sequence: 2,
        pharmacyName: 'Apotheek Noord',
        address: {
          street: 'Noord 2',
          houseNumber: '2',
          postalCode: '2000BB',
          city: 'Utrecht',
          country: 'NL',
        },
      }),
    ])
    const wrapper = mountPage()
    await nextTick()
    const toggles = wrapper.findAll('[data-testid="route-stop-details-toggle"]')
    expect(toggles.length).toBeGreaterThan(0)
    expect(toggles[0].attributes('aria-expanded')).toBe('false')
    await toggles[0].trigger('click')
    expect(toggles[0].attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('[data-testid="route-stop"]').length).toBe(2)
  })

  it('shows arrival pending, syncing, conflict and retry controls', async () => {
    myTodayRoute.value = makeRoute(RouteStatus.InProgress)

    arrivalVm.value = {
      ...arrivalVm.value,
      state: 'pending',
      canCancelPending: true,
      clientArrivedAt: '2026-07-29T09:00:00.000Z',
      pendingActionId: 'pending-1',
    }
    let wrapper = mountPage()
    await nextTick()
    expect(
      wrapper.find('[data-testid="route-stop-arrival-pending"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="route-stop-arrival-cancel"]').exists(),
    ).toBe(true)

    arrivalVm.value = {
      ...arrivalVm.value,
      state: 'syncing',
      canCancelPending: false,
    }
    wrapper = mountPage()
    await nextTick()
    expect(
      wrapper.find('[data-testid="route-stop-arrival-syncing"]').exists(),
    ).toBe(true)

    arrivalVm.value = {
      ...arrivalVm.value,
      state: 'conflict',
      canRetry: true,
      canDiscard: true,
    }
    wrapper = mountPage()
    await nextTick()
    expect(
      wrapper.find('[data-testid="route-stop-arrival-error"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="route-stop-arrival-retry"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="route-stop-arrival-discard"]').exists(),
    ).toBe(true)
  })
})
