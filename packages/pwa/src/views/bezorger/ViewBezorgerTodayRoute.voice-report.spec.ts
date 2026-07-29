/**
 * @vitest-environment happy-dom
 *
 * Placement / visibility of stop-scoped voice reports on the courier today route.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { RouteStatus, UserRole } from '@vaccin-delivery/types'

import ViewBezorgerTodayRoute from '@/views/bezorger/ViewBezorgerTodayRoute.vue'
import { __resetAppI18nForTests } from '@/i18n'
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
const currentUser = ref<{ role: UserRole } | null>({
  role: UserRole.Bezorger,
})

vi.mock('@/composables/useDeliveryRoutes', () => ({
  RouteStatus,
  useDeliveryRoutes: () => ({
    myTodayRoute,
    loading: ref(false),
    refreshing: ref(false),
    updatingStatus: ref(false),
    errorMessage: ref(null),
    statusError: ref(null),
    todayRouteSource,
    todayRouteCachedAt: ref(null),
    todayRouteRefreshError: ref(null),
    todayRouteIsReadOnly,
    isOnline: useOnlineStatus().isOnline,
    loadMyTodayRoute,
    updateRouteStatus: vi.fn(),
    subscribeToTodayRouteUpdates: vi.fn(),
    stopTodayRouteSubscription: vi.fn(),
    formatAddress: () => 'Hoofdstraat 1, 1000AA Amsterdam',
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
    viewModelForStop: () => ({
      state: 'idle',
      canMarkArrived: false,
      clientArrivedAt: null,
      recordedAt: null,
      pendingLocal: false,
    }),
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
      props: [
        'routeId',
        'routeStatus',
        'routeSource',
        'allowRecording',
        'showCourierName',
        'canRetryTranscription',
        'titleKey',
        'stopId',
        'stopSequence',
        'pharmacyName',
        'mode',
      ],
      template: `
      <section
        data-testid="route-voice-reports-section"
        :data-allow-recording="allowRecording"
        :data-route-status="routeStatus"
        :data-can-retry="canRetryTranscription"
        :data-title-key="titleKey"
        :data-mode="mode"
        :data-stop-id="stopId"
        class="rounded-lg border border-default px-4 py-3"
      >
        <h2>{{ titleKey || mode }}</h2>
      </section>
    `,
    },
  }),
)

vi.mock(
  '@/components/feature/bezorger/FeatureBezorgerDeliveryQrWorkflow.vue',
  () => ({
    default: {
      name: 'FeatureBezorgerDeliveryQrWorkflow',
      template: '<div data-testid="delivery-qr-stub" />',
    },
  }),
)

vi.mock(
  '@/components/feature/routes/FeatureRouteLocationStatusCard.vue',
  () => ({
    default: {
      name: 'FeatureRouteLocationStatusCard',
      template: '<div data-testid="route-location-status-card" />',
    },
  }),
)

const uiStubs = {
  UButton: {
    props: ['loading', 'disabled', 'block', 'size', 'color', 'variant', 'to'],
    emits: ['click'],
    template:
      '<button type="button" :disabled="disabled" :data-testid="$attrs[\'data-testid\']" @click="$emit(\'click\')"><slot /></button>',
  },
  UAlert: {
    props: ['title', 'description', 'color'],
    template:
      '<div :data-testid="$attrs[\'data-testid\']"><p>{{ title }}</p></div>',
  },
  UBadge: {
    template: '<span :data-testid="$attrs[\'data-testid\']"><slot /></span>',
  },
  UIcon: { template: '<span />' },
  CommonEmptyState: { template: '<div data-testid="empty-state" />' },
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
      '<section data-testid="common-page-section"><h2 v-if="title">{{ title }}</h2><slot /></section>',
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
    deliveryDate: '2026-07-28',
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
    generatedAt: '2026-07-28T00:00:00.000Z',
    generatedByUserId: 'admin',
    createdAt: '2026-07-28T00:00:00.000Z',
    updatedAt: '2026-07-28T00:00:00.000Z',
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

describe('ViewBezorgerTodayRoute voice report placement', () => {
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
    currentUser.value = { role: UserRole.Bezorger }
    todayRouteSource.value = 'SERVER'
    todayRouteIsReadOnly.value = false
    myTodayRoute.value = makeRoute(RouteStatus.InProgress)
  })

  afterEach(() => {
    __resetOnlineStatusForTests()
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('mounts per-stop voice recorder near QR / current stop, not in tools', async () => {
    const wrapper = mountPage()
    await nextTick()

    const stopRecorders = wrapper.findAll(
      '[data-testid="route-stop-voice-recorder"]',
    )
    expect(stopRecorders.length).toBeGreaterThanOrEqual(1)

    const stopSection = stopRecorders[0].find(
      '[data-testid="route-voice-reports-section"]',
    )
    expect(stopSection.exists()).toBe(true)
    expect(stopSection.attributes('data-mode')).toBe('stop')
    expect(stopSection.attributes('data-stop-id')).toBe('stop-1')
    expect(stopSection.attributes('data-allow-recording')).toBe('true')

    const tools = wrapper.find('[data-testid="route-tools-section"]')
    expect(tools.exists()).toBe(true)
    expect(
      tools.find('[data-testid="route-voice-reports-section"]').exists(),
    ).toBe(false)
    expect(
      tools.find('[data-testid="route-location-status-card"]').exists(),
    ).toBe(true)
  })

  it('keeps stop recording allowed after delivery while IN_PROGRESS', async () => {
    myTodayRoute.value = makeRoute(RouteStatus.InProgress, [
      makeStop({
        qrConsumed: true,
        deliveredAt: '2026-07-28T10:00:00.000Z',
      }),
    ])
    const wrapper = mountPage()
    await nextTick()
    const stopSection = wrapper
      .find('[data-testid="route-stop-voice-recorder"]')
      .find('[data-testid="route-voice-reports-section"]')
    expect(stopSection.exists()).toBe(true)
    expect(stopSection.attributes('data-allow-recording')).toBe('true')
  })

  it('mounts a legacy route reports section without recording', async () => {
    const wrapper = mountPage()
    await nextTick()
    const legacy = wrapper.find('[data-testid="route-voice-legacy-section"]')
    expect(legacy.exists()).toBe(true)
    const section = legacy.find('[data-testid="route-voice-reports-section"]')
    expect(section.attributes('data-mode')).toBe('legacy')
    expect(section.attributes('data-allow-recording')).toBe('false')
  })

  it('hides Voice report sections when courier has no today route', async () => {
    myTodayRoute.value = null
    const wrapper = mountPage()
    await nextTick()
    expect(
      wrapper.find('[data-testid="route-voice-reports-section"]').exists(),
    ).toBe(false)
  })

  it('disables stop recording for ASSIGNED route', async () => {
    myTodayRoute.value = makeRoute(RouteStatus.Assigned)
    const wrapper = mountPage()
    await nextTick()
    const stopSection = wrapper
      .find('[data-testid="route-stop-voice-recorder"]')
      .find('[data-testid="route-voice-reports-section"]')
    expect(stopSection.exists()).toBe(true)
    expect(stopSection.attributes('data-allow-recording')).toBe('false')
  })

  it('disables stop recording for COMPLETED route', async () => {
    myTodayRoute.value = makeRoute(RouteStatus.Completed)
    const wrapper = mountPage()
    await nextTick()
    const stopSection = wrapper
      .find('[data-testid="route-stop-voice-recorder"]')
      .find('[data-testid="route-voice-reports-section"]')
    expect(stopSection.exists()).toBe(true)
    expect(stopSection.attributes('data-allow-recording')).toBe('false')
  })

  it('places stop voice near QR before tools and complete', async () => {
    const wrapper = mountPage()
    await nextTick()
    const html = wrapper.html()
    const voiceIdx = html.indexOf('data-testid="route-stop-voice-recorder"')
    const toolsIdx = html.indexOf('data-testid="route-tools-section"')
    const completeIdx = html.indexOf('data-testid="route-complete"')
    expect(voiceIdx).toBeGreaterThan(-1)
    expect(toolsIdx).toBeGreaterThan(voiceIdx)
    expect(completeIdx).toBeGreaterThan(toolsIdx)
  })
})
