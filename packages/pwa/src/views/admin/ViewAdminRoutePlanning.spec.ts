/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const loadActiveTemplates = vi.fn()
const loadDeliveryRoutes = vi.fn()
const loadProfileOptions = vi.fn()
const generateDeliveryRoute = vi.fn()
const updateRouteStatus = vi.fn()

function todayLocalDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const today = todayLocalDate()

const deliveryRoutes = ref([
  {
    id: 'route-1',
    deliveryDate: today,
    status: 'ASSIGNED',
    generatedAt: `${today}T07:00:00.000Z`,
    bezorgerProfileId: 'b1',
    skippedApothekerProfileIds: [],
    locationStatus: null,
    statusHistory: [
      {
        fromStatus: null,
        toStatus: 'ASSIGNED',
        changedAt: `${today}T07:00:00.000Z`,
      },
    ],
    stops: [
      {
        stopId: 's1',
        sequence: 1,
        pharmacyName: 'City Pharmacy',
        address: { street: 'Main', city: 'Town' },
        orderCount: 1,
        totalQuantity: 5,
        orderIds: ['o1'],
        lines: [{ vaccineId: 'v1', vaccineName: 'Flu', quantity: 5 }],
        qrAvailable: true,
        qrConsumed: false,
      },
    ],
  },
])

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}))

vi.mock('@/composables/useDeliveryRoutes', () => ({
  RouteStatus: {
    Assigned: 'ASSIGNED',
    InProgress: 'IN_PROGRESS',
    Completed: 'COMPLETED',
    Cancelled: 'CANCELLED',
  },
  useDeliveryRoutes: () => ({
    deliveryRoutes,
    activeTemplates: ref([
      { id: 't1', name: 'North', bezorgerProfileId: 'b1' },
    ]),
    loading: ref(false),
    templatesLoading: ref(false),
    generating: ref(false),
    updatingStatus: ref(false),
    errorMessage: ref(null),
    generateError: ref(null),
    statusError: ref(null),
    successMessage: ref(null),
    loadActiveTemplates,
    loadDeliveryRoutes,
    generateDeliveryRoute,
    updateRouteStatus,
    formatAddress: () => 'Main, Town',
    formatStatusHistoryEntry: () => 'Assigned',
    canRegenerateRoute: () => true,
  }),
}))

vi.mock('@/composables/useRouteTemplates', () => ({
  useRouteTemplates: () => ({
    loadProfileOptions,
    findBezorgerProfile: () => ({
      displayName: 'Courier Ada',
      vehicleLabel: 'Van',
    }),
  }),
}))

vi.mock('@/composables/useDeliveryStopQrDisplay', () => ({
  useDeliveryStopQrDisplay: () => ({
    open: ref(false),
    context: ref(null),
    objectUrl: ref(null),
    loading: ref(false),
    errorMessage: ref(null),
    inactiveMessage: ref(null),
    canDownload: ref(false),
    downloadFilename: ref(''),
    openDeliveryStopQr: vi.fn(),
    closeModal: vi.fn(),
    retry: vi.fn(),
    downloadQr: vi.fn(),
  }),
}))

vi.mock('@/composables/useDeliveryManifestDownload', () => ({
  useDeliveryManifestDownload: () => ({
    loading: ref(false),
    errorMessage: ref(null),
    successMessage: ref(null),
    downloadRouteManifest: vi.fn(),
  }),
}))

vi.mock('@/composables/useOnlineStatus', () => ({
  useOnlineStatus: () => ({ isOnline: ref(true) }),
}))

vi.mock('@/i18n', () => ({
  formatDateTime: (value: string) => `datetime:${value}`,
  routeStatusLabel: (value: string) => `status:${value}`,
  translatePlural: (key: string, count: number) => `${key}:${count}`,
}))

vi.mock('@/components/feature/routes/route-location-status', () => ({
  toRouteLocationStatusCardProps: () => ({
    hasLocation: false,
    viewerRole: 'ADMIN',
    routeStatus: 'ASSIGNED',
  }),
}))

import ViewAdminRoutePlanning from '@/views/admin/ViewAdminRoutePlanning.vue'

describe('ViewAdminRoutePlanning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mountPage() {
    return mount(ViewAdminRoutePlanning, {
      global: {
        stubs: {
          CommonPageHeader: {
            props: ['title', 'subtitle'],
            template:
              '<header data-testid="common-page-header"><h1>{{ title }}</h1></header>',
          },
          CommonPageSection: {
            props: ['title', 'description', 'variant'],
            template:
              '<section data-testid="common-page-section"><h2 v-if="title">{{ title }}</h2><slot /></section>',
          },
          CommonLoadingSkeleton: true,
          CommonEmptyState: true,
          CommonErrorState: true,
          FeatureRouteLocationStatusCard: {
            template: '<div data-testid="route-location-status-card" />',
          },
          FeatureRouteVoiceRecorder: {
            template: '<div data-testid="route-voice-recorder" />',
          },
          FeatureDeliveryStopQrModal: true,
          UButton: {
            template:
              '<button type="button" v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
          },
          UBadge: { template: '<span><slot /></span>' },
          UInput: {
            props: ['modelValue'],
            emits: ['update:modelValue'],
            template:
              '<input :value="modelValue" v-bind="$attrs" @input="$emit(\'update:modelValue\', ($event.target).value)" />',
          },
          USelect: true,
          UFormField: { template: '<div><slot /></div>' },
          UAlert: true,
          UModal: {
            template: '<div><slot name="body" /><slot name="footer" /></div>',
          },
          UIcon: true,
        },
      },
    })
  }

  it('uses page header and keeps route actions discoverable', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(
      wrapper.find('[data-testid="admin-download-route-manifest"]').exists(),
    ).toBe(true)
    expect(wrapper.html()).not.toMatch(/UCard/)
  })

  it('renders stops and voice reports', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('[data-testid="admin-route-stop"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="admin-stop-qr-state"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="route-voice-recorder"]').exists()).toBe(
      true,
    )
  })
})
