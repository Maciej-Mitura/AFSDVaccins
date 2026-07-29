/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

import { routeSkipReasonLabelKey } from '@/composables/route-generation-diagnostics'

const loadActiveTemplates = vi.fn()
const loadDeliveryRoutes = vi.fn()
const loadProfileOptions = vi.fn()
const generateDeliveryRoute = vi.fn()
const updateRouteStatus = vi.fn()
const loadRoutePlanningDiagnostics = vi.fn().mockResolvedValue(null)

function todayLocalDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const today = todayLocalDate()

const lastGenerationDiagnostics = ref<{
  includedOrderCount: number
  includedStopCount: number
  skippedOrderCount: number
  skippedPharmacyCount: number
  regenerated: boolean
  regenerationNeeded: boolean
  skipGroups: Array<{
    code: string
    count: number
    pharmacyNames: string[]
    orderIds: string[]
    apothekerProfileIds: string[]
  }>
} | null>(null)

const planningDiagnostics = ref<{
  eligibleUnplannedOrderCount: number
  regenerationNeeded: boolean
} | null>(null)

const successMessage = ref<string | null>(null)

const deliveryRoutes = ref([
  {
    id: 'route-1',
    deliveryDate: today,
    status: 'ASSIGNED',
    generatedAt: `${today}T07:00:00.000Z`,
    bezorgerProfileId: 'b1',
    skippedApothekerProfileIds: [],
    locationStatus: null,
    statusHistory: [],
    stops: [
      {
        stopId: 's1',
        sequence: 1,
        pharmacyName: 'City Pharmacy',
        address: { street: 'Main', city: 'Town' },
        orderCount: 1,
        totalQuantity: 1,
        orderIds: ['o1'],
        lines: [{ vaccineId: 'v1', vaccineName: 'Flu', quantity: 1 }],
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
    successMessage,
    lastGenerationDiagnostics,
    planningDiagnostics,
    planningDiagnosticsLoading: ref(false),
    loadActiveTemplates,
    loadDeliveryRoutes,
    generateDeliveryRoute,
    loadRoutePlanningDiagnostics,
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

describe('ViewAdminRoutePlanning Phase 36C diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lastGenerationDiagnostics.value = null
    planningDiagnostics.value = null
    successMessage.value = null
  })

  function mountPage() {
    return mount(ViewAdminRoutePlanning, {
      global: {
        stubs: {
          CommonPageHeader: {
            props: ['title', 'subtitle'],
            template: '<header><h1>{{ title }}</h1></header>',
          },
          CommonPageSection: {
            props: ['title', 'variant'],
            template:
              '<section><h2 v-if="title">{{ title }}</h2><slot /></section>',
          },
          CommonLoadingSkeleton: true,
          CommonEmptyState: true,
          CommonErrorState: true,
          FeatureRouteLocationStatusCard: true,
          FeatureRouteVoiceRecorder: true,
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
          UAlert: {
            props: ['title', 'description', 'color'],
            template:
              '<div data-testid="alert" :data-color="color"><strong>{{ title }}</strong><p>{{ description }}</p><slot /></div>',
          },
          UModal: {
            template: '<div><slot name="body" /><slot name="footer" /></div>',
          },
          UIcon: true,
        },
      },
    })
  }

  it('maps skip reason codes to translation keys', () => {
    expect(routeSkipReasonLabelKey('PHARMACY_NOT_IN_ACTIVE_TEMPLATE')).toBe(
      'routes.diagnostics.reason.notInTemplate',
    )
    expect(routeSkipReasonLabelKey('UNKNOWN')).toBe(
      'routes.diagnostics.reason.other',
    )
  })

  it('shows partial generation summary and template link', async () => {
    successMessage.value = 'success.routes.generatedPartial'
    lastGenerationDiagnostics.value = {
      includedOrderCount: 1,
      includedStopCount: 1,
      skippedOrderCount: 1,
      skippedPharmacyCount: 1,
      regenerated: false,
      regenerationNeeded: false,
      skipGroups: [
        {
          code: 'PHARMACY_NOT_IN_ACTIVE_TEMPLATE',
          count: 1,
          pharmacyNames: ['Off Template Pharmacy'],
          orderIds: ['o2'],
          apothekerProfileIds: ['p2'],
        },
      ],
    }

    const wrapper = mountPage()
    await flushPromises()

    expect(
      wrapper
        .find('[data-testid="admin-route-planning-generation-summary"]')
        .exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="admin-route-planning-skip-groups"]').text(),
    ).toContain('Off Template Pharmacy')
    expect(
      wrapper
        .find('[data-testid="admin-route-planning-template-link"]')
        .exists(),
    ).toBe(true)
  })

  it('shows freshness warning when unplanned eligible orders exist', async () => {
    planningDiagnostics.value = {
      eligibleUnplannedOrderCount: 2,
      regenerationNeeded: true,
    }

    const wrapper = mountPage()
    await flushPromises()

    expect(
      wrapper.find('[data-testid="admin-route-planning-freshness"]').exists(),
    ).toBe(true)
    expect(
      wrapper
        .find('[data-testid="admin-route-planning-snapshot-hint"]')
        .exists(),
    ).toBe(true)
  })
})
