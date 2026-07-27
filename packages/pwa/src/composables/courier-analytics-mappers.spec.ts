import { CourierAnalyticsDataCompleteness } from '@vaccin-delivery/types'
import { describe, expect, it } from 'vitest'

import {
  formatHandlingDuration,
  formatRatePercent,
  formatScore,
  hasDataQualityIssues,
  hasMeaningfulAnalytics,
  isInsufficient,
  mapComponentMatrix,
  mapDistribution,
  mapHandlingDurations,
  mapKpiCards,
  mapMonthlyActivityChronological,
  mapScoreComparison,
  type AnalyticsPayload,
  type RankingRow,
} from '@/composables/courier-analytics-mappers'

function rawMetrics(overrides: Partial<RankingRow['rawMetrics']> = {}) {
  return {
    totalAssignedRoutes: 10,
    completedRoutes: 8,
    incompleteRoutes: 1,
    cancelledRoutes: 1,
    activeRoutes: 0,
    routeCompletionRate: 88.9,
    totalEligibleStops: 20,
    deliveredStops: 18,
    undeliveredOverdueStops: 2,
    deliveryCompletionRate: 90,
    totalOrdersDelivered: 30,
    totalVaccineQuantityDelivered: 100,
    deliveredStopsWithValidTimestamp: 18,
    onTimeDeliveredStops: 16,
    lateDeliveredStops: 2,
    onTimeDeliveryRate: 88.9,
    deliveredStopsWithValidProofMethod: 18,
    qrConfirmedStops: 15,
    qrConfirmationRate: 83.3,
    consistencyIssueCount: 1,
    consistencyEligibleUnits: 20,
    consistencyScore: 95,
    averageHandlingDurationSeconds: 420,
    medianHandlingDurationSeconds: 360,
    handlingDurationSampleCount: 12,
    ...overrides,
  }
}

function ranking(
  overrides: Partial<RankingRow> & Pick<RankingRow, 'rank' | 'displayName'>,
): RankingRow {
  return {
    courierProfileId: `p-${overrides.rank}`,
    courierUserId: `u-${overrides.rank}`,
    vehicleLabel: null,
    totalScore: 80,
    dataCompleteness: CourierAnalyticsDataCompleteness.Eligible,
    componentScores: {
      routeCompletion: 90,
      deliveryCompletion: 85,
      onTime: 80,
      qrConfirmation: 70,
      operationalConsistency: 95,
    },
    weightedContributions: {
      routeCompletion: 31.5,
      deliveryCompletion: 21.25,
      onTime: 16,
      qrConfirmation: 7,
      operationalConsistency: 9.5,
    },
    rawMetrics: rawMetrics(),
    consistencyIssueBreakdown: {
      overdueIncompleteRoutes: 0,
      abandonedProcessingConfirmations: 0,
      invalidOrIncompleteProofs: 1,
    },
    ...overrides,
  }
}

function samplePayload(
  overrides: Partial<AnalyticsPayload> = {},
): AnalyticsPayload {
  return {
    generatedAt: '2026-07-27T10:00:00.000Z',
    summary: {
      courierCount: 2,
      couriersWithEligibleData: 1,
      currentBezorgerProfilesWithZeroRoutes: 0,
      totalAssignedRoutes: 12,
      totalCompletedRoutes: 9,
      totalCancelledRoutes: 1,
      totalDeliveredStops: 20,
      totalDeliveredOrders: 35,
      totalDeliveredVaccineQuantity: 120,
      overallRouteCompletionRate: 90,
      overallDeliveryCompletionRate: 91,
      overallOnTimeRate: 88,
      overallQrConfirmationRate: 80,
      averageReliabilityScore: 82.5,
      medianReliabilityScore: 82.5,
      highestReliabilityScore: 90,
      topCourier: {
        courierProfileId: 'p-1',
        displayName: 'Ada',
        totalScore: 90,
      },
    },
    courierRankings: [
      ranking({ rank: 1, displayName: 'Ada', totalScore: 90 }),
      ranking({
        rank: 2,
        displayName: 'Bob',
        totalScore: 0,
        dataCompleteness: CourierAnalyticsDataCompleteness.Insufficient,
        rawMetrics: rawMetrics({
          routeCompletionRate: null,
          deliveryCompletionRate: null,
          onTimeDeliveryRate: null,
          qrConfirmationRate: null,
          handlingDurationSampleCount: 0,
          averageHandlingDurationSeconds: null,
          medianHandlingDurationSeconds: null,
        }),
      }),
    ],
    monthlyActivity: [
      {
        month: '2026-02',
        assignedRoutes: 2,
        completedRoutes: 2,
        deliveredStops: 4,
        deliveredOrders: 5,
        deliveredVaccineQuantity: 20,
        onTimeStops: 3,
        lateStops: 1,
      },
      {
        month: '2026-01',
        assignedRoutes: 1,
        completedRoutes: 1,
        deliveredStops: 2,
        deliveredOrders: 3,
        deliveredVaccineQuantity: 10,
        onTimeStops: 2,
        lateStops: 0,
      },
    ],
    routeStatusDistribution: [
      { key: 'COMPLETED', count: 9 },
      { key: 'ASSIGNED', count: 2 },
    ],
    deliveryTimelinessDistribution: [
      { key: 'ON_TIME', count: 16 },
      { key: 'LATE', count: 2 },
      { key: 'UNKNOWN', count: 1 },
    ],
    deliveryProofDistribution: [
      { key: 'QR', count: 15 },
      { key: 'ADMIN', count: 3 },
      { key: 'UNKNOWN', count: 1 },
    ],
    dataQuality: {
      legacyRoutesWithoutRequiredFields: 1,
      deliveredStopsWithoutTimestamp: 1,
      invalidStopSequences: 0,
      missingOrders: 0,
      invalidHandlingDurations: 2,
      malformedProofs: 0,
    },
    ...overrides,
  }
}

describe('courier-analytics-mappers', () => {
  it('maps KPI cards from summary without inventing rates', () => {
    const cards = mapKpiCards(samplePayload().summary)
    expect(cards).toHaveLength(6)
    expect(cards[0]?.value).toBe('1')
    expect(cards.find(c => c.id === 'onTime')?.value).toBe('88.0%')
  })

  it('marks null rates as insufficient on KPI cards', () => {
    const summary = {
      ...samplePayload().summary,
      overallOnTimeRate: null,
      averageReliabilityScore: null,
    }
    const cards = mapKpiCards(summary)
    expect(cards.find(c => c.id === 'onTime')?.insufficient).toBe(true)
    expect(cards.find(c => c.id === 'avgScore')?.value).toBe('—')
  })

  it('preserves backend ranking order for score comparison', () => {
    const items = mapScoreComparison(samplePayload().courierRankings, {
      includeInsufficient: true,
    })
    expect(items.map(i => i.displayName)).toEqual(['Ada', 'Bob'])
    expect(items[0]?.totalScore).toBe(90)
  })

  it('excludes insufficient couriers from score chart by default', () => {
    const items = mapScoreComparison(samplePayload().courierRankings)
    expect(items).toHaveLength(1)
    expect(items[0]?.displayName).toBe('Ada')
  })

  it('maps five reliability components', () => {
    const rows = mapComponentMatrix(samplePayload().courierRankings)
    expect(rows).toHaveLength(1)
    const scores = rows[0]?.scores
    expect(scores).toBeDefined()
    expect(Object.keys(scores ?? {})).toEqual([
      'routeCompletion',
      'deliveryCompletion',
      'onTime',
      'qrConfirmation',
      'operationalConsistency',
    ])
  })

  it('sorts monthly activity chronologically', () => {
    const months = mapMonthlyActivityChronological(
      samplePayload().monthlyActivity,
    )
    expect(months.map(m => m.month)).toEqual(['2026-01', '2026-02'])
  })

  it('maps distribution percentages', () => {
    const slices = mapDistribution([
      { key: 'QR', count: 75 },
      { key: 'ADMIN', count: 25 },
    ])
    expect(slices[0]?.percentage).toBe(75)
    expect(slices[1]?.percentage).toBe(25)
  })

  it('excludes zero-sample couriers from handling chart', () => {
    const items = mapHandlingDurations(samplePayload().courierRankings)
    expect(items).toHaveLength(1)
    expect(items[0]?.sampleCount).toBe(12)
  })

  it('formats handling durations readably', () => {
    expect(formatHandlingDuration(45)).toBe('45s')
    expect(formatHandlingDuration(125)).toBe('2m 5s')
    expect(formatHandlingDuration(3725)).toBe('1h 2m')
    expect(formatHandlingDuration(null)).toBe('—')
  })

  it('formats scores and null rates without inventing perfect values', () => {
    expect(formatScore(82.456)).toBe('82.5')
    expect(formatRatePercent(null)).toBe('—')
    expect(isInsufficient(CourierAnalyticsDataCompleteness.Insufficient)).toBe(
      true,
    )
  })

  it('detects meaningful analytics and data-quality issues', () => {
    const payload = samplePayload()
    expect(hasMeaningfulAnalytics(payload)).toBe(true)
    expect(hasDataQualityIssues(payload.dataQuality)).toBe(true)
    expect(
      hasMeaningfulAnalytics(
        samplePayload({
          summary: {
            ...samplePayload().summary,
            totalAssignedRoutes: 0,
          },
          courierRankings: [],
        }),
      ),
    ).toBe(false)
  })
})
