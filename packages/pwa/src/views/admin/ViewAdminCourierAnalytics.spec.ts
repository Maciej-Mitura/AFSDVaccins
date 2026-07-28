/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { CourierAnalyticsDataCompleteness } from '@vaccin-delivery/types'

const load = vi.fn()
const refresh = vi.fn()
const exportCsv = vi.fn()
const selectCourier = vi.fn()
const clearSelection = vi.fn()
const clearExportFeedback = vi.fn()

const hasData = ref(true)
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const payload = ref({ ok: true })
const kpiCards = ref([
  {
    id: 'eligible',
    value: '2',
    labelKey: 'admin.courierAnalytics.kpi.eligibleCouriers',
  },
])
const rankings = ref([
  {
    courierProfileId: 'p1',
    courierUserId: 'u1',
    displayName: 'Ada',
    vehicleLabel: 'Van',
    rank: 1,
    totalScore: 90,
    dataCompleteness: CourierAnalyticsDataCompleteness.Eligible,
    componentScores: {
      routeCompletion: 90,
      deliveryCompletion: 90,
      onTime: 90,
      qrConfirmation: 90,
      operationalConsistency: 90,
    },
    weightedContributions: {
      routeCompletion: 30,
      deliveryCompletion: 20,
      onTime: 18,
      qrConfirmation: 9,
      operationalConsistency: 9,
    },
    rawMetrics: {
      totalAssignedRoutes: 5,
      completedRoutes: 5,
      incompleteRoutes: 0,
      cancelledRoutes: 0,
      activeRoutes: 0,
      routeCompletionRate: 100,
      totalEligibleStops: 10,
      deliveredStops: 10,
      undeliveredOverdueStops: 0,
      deliveryCompletionRate: 100,
      totalOrdersDelivered: 10,
      totalVaccineQuantityDelivered: 20,
      deliveredStopsWithValidTimestamp: 10,
      onTimeDeliveredStops: 9,
      lateDeliveredStops: 1,
      onTimeDeliveryRate: 90,
      deliveredStopsWithValidProofMethod: 10,
      qrConfirmedStops: 8,
      qrConfirmationRate: 80,
      consistencyIssueCount: 0,
      consistencyEligibleUnits: 10,
      consistencyScore: 100,
      averageHandlingDurationSeconds: 300,
      medianHandlingDurationSeconds: 280,
      handlingDurationSampleCount: 5,
    },
    consistencyIssueBreakdown: {
      overdueIncompleteRoutes: 0,
      abandonedProcessingConfirmations: 0,
      invalidOrIncompleteProofs: 0,
    },
  },
])

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}))

vi.mock('@/composables/useCourierPerformanceAnalytics', () => ({
  useCourierPerformanceAnalytics: () => ({
    loading,
    refreshing: ref(false),
    exporting: ref(false),
    errorMessage,
    exportErrorMessage: ref(null),
    exportSuccessMessage: ref(null),
    payload,
    generatedAtLabel: ref('2026-07-28'),
    hasData,
    showDataQuality: ref(false),
    kpiCards,
    rankings,
    scoreComparison: ref([]),
    insufficientExcludedFromScoreChart: ref(0),
    componentMatrix: ref([]),
    monthlyActivity: ref([]),
    routeStatusDistribution: ref([]),
    timelinessDistribution: ref([]),
    proofDistribution: ref([]),
    handlingDurations: ref([]),
    selectedCourier: ref(null),
    selectedCourierProfileId: ref(null),
    dataQuality: ref(null),
    load,
    refresh,
    selectCourier,
    clearSelection,
    exportCsv,
    clearExportFeedback,
  }),
}))

vi.mock('@/composables/courier-analytics-mappers', async importOriginal => {
  const actual =
    await importOriginal<
      typeof import('@/composables/courier-analytics-mappers')
    >()
  return {
    ...actual,
    formatHandlingDuration: () => '5m',
    formatScore: (value: number | null | undefined) =>
      value == null ? '—' : String(value),
    isInsufficient: () => false,
  }
})

vi.mock('@/composables/useChartThemeRevision', () => ({
  useChartThemeRevision: () => computed(() => 0),
}))

vi.mock('@/components/feature/admin/analytics/courier-chart-options', () => ({
  buildComponentMatrixOption: () => null,
  buildDonutOption: () => null,
  buildHandlingDurationOption: () => null,
  buildMonthlyActivityOption: () => null,
  buildScoreComparisonOption: () => null,
}))

import ViewAdminCourierAnalytics from '@/views/admin/ViewAdminCourierAnalytics.vue'

describe('ViewAdminCourierAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasData.value = true
    loading.value = false
    errorMessage.value = null
    payload.value = { ok: true }
  })

  function mountPage() {
    const buttonStub = {
      name: 'UButton',
      inheritAttrs: true,
      template:
        '<button type="button" v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>',
    }
    return mount(ViewAdminCourierAnalytics, {
      global: {
        stubs: {
          CommonPageHeader: {
            props: ['title', 'subtitle', 'meta'],
            template:
              '<header data-testid="common-page-header"><h1>{{ title }}</h1><div data-testid="common-page-header-actions"><slot name="actions" /></div></header>',
          },
          CommonPageSection: {
            props: ['title', 'description', 'variant'],
            template:
              '<section data-testid="common-page-section"><h2 v-if="title">{{ title }}</h2><slot /><slot name="actions" /></section>',
          },
          CommonLoadingSkeleton: true,
          CommonEmptyState: {
            props: ['title', 'description'],
            template: '<div data-testid="empty-state">{{ title }}</div>',
          },
          CommonErrorState: {
            props: ['title', 'description'],
            template: '<div data-testid="error-state">{{ title }}</div>',
          },
          CommonEcharts: {
            template: '<div data-testid="echarts-host" />',
          },
          FeatureCourierAnalyticsKpi: {
            template: '<div data-testid="courier-analytics-kpi" />',
          },
          FeatureCourierAnalyticsLeaderboard: true,
          FeatureCourierAnalyticsDetail: true,
          UButton: buttonStub,
          Button: buttonStub,
          UAlert: {
            props: ['title'],
            template:
              '<div data-testid="alert" v-bind="$attrs"><slot />{{ title }}</div>',
          },
          UIcon: true,
          ULink: true,
        },
      },
    })
  }

  it('places CSV export in the page header actions', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(
      wrapper
        .get('[data-testid="common-page-header-actions"]')
        .find('[data-testid="courier-analytics-export"]')
        .exists(),
    ).toBe(true)
  })

  it('renders compact metric strip and chart sections without UCard', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('[data-testid="courier-analytics-kpi"]').exists()).toBe(
      true,
    )
    expect(
      wrapper.findAll('[data-testid="echarts-host"]').length,
    ).toBeGreaterThan(0)
    expect(wrapper.html()).not.toMatch(/UCard/)
  })

  it('keeps refresh and export wiring', async () => {
    const wrapper = mountPage()
    await flushPromises()

    await wrapper
      .get('[data-testid="courier-analytics-refresh"]')
      .trigger('click')
    expect(refresh).toHaveBeenCalled()

    await wrapper
      .get('[data-testid="courier-analytics-export"]')
      .trigger('click')
    expect(exportCsv).toHaveBeenCalled()
  })

  it('shows insufficient/empty data state', async () => {
    hasData.value = false
    const wrapper = mountPage()
    await flushPromises()

    expect(
      wrapper.find('[data-testid="courier-analytics-no-data"]').exists(),
    ).toBe(true)
  })
})
