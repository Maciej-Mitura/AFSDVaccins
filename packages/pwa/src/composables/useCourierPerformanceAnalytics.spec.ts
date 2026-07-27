/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CourierAnalyticsDataCompleteness } from '@vaccin-delivery/types'

const query = vi.fn()

vi.mock('@/composables/useGraphQL', () => ({
  default: () => ({
    apolloClient: { query },
  }),
}))

vi.mock('@/composables/useCurrentUser', () => ({
  mapGraphQLError: () => 'mapped-error',
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/i18n', () => ({
  formatDateTime: () => '27/07/2026, 12:00',
}))

const fetchCourierPerformanceCsv = vi.fn()
const downloadCourierAnalyticsCsv = vi.fn()

vi.mock('@/api/courier-analytics-rest', async () => {
  const actual = await vi.importActual<
    typeof import('@/api/courier-analytics-rest')
  >('@/api/courier-analytics-rest')
  return {
    ...actual,
    fetchCourierPerformanceCsv: (...args: unknown[]) =>
      fetchCourierPerformanceCsv(...args),
    downloadCourierAnalyticsCsv: (...args: unknown[]) =>
      downloadCourierAnalyticsCsv(...args),
  }
})

import { useCourierPerformanceAnalytics } from '@/composables/useCourierPerformanceAnalytics'
import { COURIER_PERFORMANCE_ANALYTICS_QUERY } from '@/assets/graphql/courier-analytics'

function analyticsPayload() {
  return {
    generatedAt: '2026-07-27T10:00:00.000Z',
    summary: {
      courierCount: 1,
      couriersWithEligibleData: 1,
      currentBezorgerProfilesWithZeroRoutes: 0,
      totalAssignedRoutes: 5,
      totalCompletedRoutes: 4,
      totalCancelledRoutes: 0,
      totalDeliveredStops: 8,
      totalDeliveredOrders: 10,
      totalDeliveredVaccineQuantity: 40,
      overallRouteCompletionRate: 100,
      overallDeliveryCompletionRate: 100,
      overallOnTimeRate: 90,
      overallQrConfirmationRate: 80,
      averageReliabilityScore: 88,
      medianReliabilityScore: 88,
      highestReliabilityScore: 88,
      topCourier: {
        courierProfileId: 'p1',
        displayName: 'Ada',
        totalScore: 88,
      },
    },
    courierRankings: [
      {
        courierProfileId: 'p1',
        courierUserId: 'u1',
        displayName: 'Ada',
        vehicleLabel: null,
        rank: 1,
        totalScore: 88,
        dataCompleteness: CourierAnalyticsDataCompleteness.Eligible,
        componentScores: {
          routeCompletion: 100,
          deliveryCompletion: 100,
          onTime: 90,
          qrConfirmation: 80,
          operationalConsistency: 100,
        },
        weightedContributions: {
          routeCompletion: 35,
          deliveryCompletion: 25,
          onTime: 18,
          qrConfirmation: 8,
          operationalConsistency: 10,
        },
        rawMetrics: {
          totalAssignedRoutes: 5,
          completedRoutes: 4,
          incompleteRoutes: 0,
          cancelledRoutes: 0,
          activeRoutes: 1,
          routeCompletionRate: 100,
          totalEligibleStops: 8,
          deliveredStops: 8,
          undeliveredOverdueStops: 0,
          deliveryCompletionRate: 100,
          totalOrdersDelivered: 10,
          totalVaccineQuantityDelivered: 40,
          deliveredStopsWithValidTimestamp: 8,
          onTimeDeliveredStops: 7,
          lateDeliveredStops: 1,
          onTimeDeliveryRate: 90,
          deliveredStopsWithValidProofMethod: 8,
          qrConfirmedStops: 6,
          qrConfirmationRate: 80,
          consistencyIssueCount: 0,
          consistencyEligibleUnits: 8,
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
    ],
    monthlyActivity: [],
    routeStatusDistribution: [],
    deliveryTimelinessDistribution: [],
    deliveryProofDistribution: [],
    dataQuality: {
      legacyRoutesWithoutRequiredFields: 0,
      deliveredStopsWithoutTimestamp: 0,
      invalidStopSequences: 0,
      missingOrders: 0,
      invalidHandlingDurations: 0,
      malformedProofs: 0,
    },
  }
}

describe('useCourierPerformanceAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    query.mockResolvedValue({
      data: { courierPerformanceAnalytics: analyticsPayload() },
    })
  })

  it('loads analytics via ADMIN GraphQL query', async () => {
    const api = useCourierPerformanceAnalytics()
    await api.load()
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        query: COURIER_PERFORMANCE_ANALYTICS_QUERY,
        variables: { refresh: false },
        fetchPolicy: 'network-only',
      }),
    )
    expect(api.rankings.value[0]?.rank).toBe(1)
    expect(api.generatedAtLabel.value).toBe('27/07/2026, 12:00')
  })

  it('refresh uses refresh: true and does not recalculate scores locally', async () => {
    const api = useCourierPerformanceAnalytics()
    await api.load()
    const scoreBefore = api.rankings.value[0]?.totalScore
    await api.refresh()
    expect(query).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variables: { refresh: true },
      }),
    )
    expect(api.rankings.value[0]?.totalScore).toBe(scoreBefore)
  })

  it('preserves backend ranking order', async () => {
    query.mockResolvedValue({
      data: {
        courierPerformanceAnalytics: {
          ...analyticsPayload(),
          courierRankings: [
            {
              ...analyticsPayload().courierRankings[0],
              rank: 1,
              displayName: 'Ada',
            },
            {
              ...analyticsPayload().courierRankings[0],
              courierProfileId: 'p2',
              rank: 2,
              displayName: 'Bob',
              totalScore: 70,
            },
          ],
        },
      },
    })
    const api = useCourierPerformanceAnalytics()
    await api.load()
    expect(api.rankings.value.map(r => r.displayName)).toEqual(['Ada', 'Bob'])
  })

  it('exports CSV through authenticated REST helper', async () => {
    fetchCourierPerformanceCsv.mockResolvedValue({
      blob: new Blob(['csv']),
      filename: 'courier-performance-all-time.csv',
      contentType: 'text/csv',
    })
    const api = useCourierPerformanceAnalytics()
    const ok = await api.exportCsv()
    expect(ok).toBe(true)
    expect(fetchCourierPerformanceCsv).toHaveBeenCalled()
    expect(downloadCourierAnalyticsCsv).toHaveBeenCalled()
    expect(api.exportSuccessMessage.value).toBe(
      'admin.courierAnalytics.export.success',
    )
  })

  it('selects courier detail without mutating ranking scores', async () => {
    const api = useCourierPerformanceAnalytics()
    await api.load()
    api.selectCourier('p1')
    expect(api.selectedCourier.value?.componentScores.routeCompletion).toBe(100)
    expect(api.selectedCourier.value?.weightedContributions.onTime).toBe(18)
    expect(api.selectedCourier.value?.rawMetrics.deliveredStops).toBe(8)
  })
})
