import {
  buildCourierAnalyticsCsv,
  escapeCsvCell,
  neutralizeCsvInjection,
} from './courier-analytics.csv'
import { CourierAnalyticsDataCompleteness } from './courier-analytics.definitions'
import type { CourierPerformanceAnalyticsResult } from './courier-analytics.types'

function sampleResult(
  overrides: Partial<CourierPerformanceAnalyticsResult> = {},
): CourierPerformanceAnalyticsResult {
  return {
    generatedAt: new Date('2026-07-15T10:00:00.000Z'),
    summary: {
      courierCount: 1,
      couriersWithEligibleData: 1,
      currentBezorgerProfilesWithZeroRoutes: 0,
      totalAssignedRoutes: 1,
      totalCompletedRoutes: 1,
      totalCancelledRoutes: 0,
      totalDeliveredStops: 1,
      totalDeliveredOrders: 1,
      totalDeliveredVaccineQuantity: 10,
      overallRouteCompletionRate: 1,
      overallDeliveryCompletionRate: 1,
      overallOnTimeRate: 1,
      overallQrConfirmationRate: 1,
      averageReliabilityScore: 100,
      medianReliabilityScore: 100,
      highestReliabilityScore: 100,
      topCourier: {
        courierProfileId: 'c1',
        displayName: 'Ada',
        totalScore: 100,
      },
    },
    courierRankings: [
      {
        courierProfileId: 'c1',
        courierUserId: 'u1',
        displayName: 'Ada',
        vehicleLabel: null,
        rank: 1,
        totalScore: 100,
        dataCompleteness: CourierAnalyticsDataCompleteness.ELIGIBLE,
        componentScores: {
          routeCompletion: 100,
          deliveryCompletion: 100,
          onTime: 100,
          qrConfirmation: 100,
          operationalConsistency: 100,
        },
        weightedContributions: {
          routeCompletion: 35,
          deliveryCompletion: 25,
          onTime: 20,
          qrConfirmation: 10,
          operationalConsistency: 10,
        },
        rawMetrics: {
          totalAssignedRoutes: 1,
          completedRoutes: 1,
          incompleteRoutes: 0,
          cancelledRoutes: 0,
          activeRoutes: 0,
          routeCompletionRate: 1,
          totalEligibleStops: 1,
          deliveredStops: 1,
          undeliveredOverdueStops: 0,
          deliveryCompletionRate: 1,
          totalOrdersDelivered: 1,
          totalVaccineQuantityDelivered: 10,
          deliveredStopsWithValidTimestamp: 1,
          onTimeDeliveredStops: 1,
          lateDeliveredStops: 0,
          onTimeDeliveryRate: 1,
          deliveredStopsWithValidProofMethod: 1,
          qrConfirmedStops: 1,
          qrConfirmationRate: 1,
          consistencyIssueCount: 0,
          consistencyEligibleUnits: 1,
          consistencyScore: 100,
          averageHandlingDurationSeconds: 120,
          medianHandlingDurationSeconds: 120,
          handlingDurationSampleCount: 1,
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
    ...overrides,
  }
}

describe('courier analytics CSV', () => {
  it('neutralises spreadsheet formula injection', () => {
    expect(neutralizeCsvInjection('=CMD()')).toBe("'=CMD()")
    expect(neutralizeCsvInjection('+1+1')).toBe("'+1+1")
    expect(neutralizeCsvInjection('-1+1')).toBe("'-1+1")
    expect(neutralizeCsvInjection('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(neutralizeCsvInjection('Ada')).toBe('Ada')
  })

  it('escapes quotes and commas', () => {
    expect(escapeCsvCell('Ada, Bob')).toBe('"Ada, Bob"')
    expect(escapeCsvCell('Say "hi"')).toBe('"Say ""hi"""')
  })

  it('builds deterministic ranked rows matching analytics order', () => {
    const result = sampleResult({
      courierRankings: [
        {
          ...sampleResult().courierRankings[0],
          rank: 1,
          displayName: 'Ada',
          totalScore: 90,
        },
        {
          ...sampleResult().courierRankings[0],
          courierProfileId: 'c2',
          courierUserId: 'u2',
          rank: 2,
          displayName: '=Evil',
          totalScore: 80,
          componentScores: {
            routeCompletion: 80,
            deliveryCompletion: 80,
            onTime: 80,
            qrConfirmation: 80,
            operationalConsistency: 80,
          },
          rawMetrics: {
            ...sampleResult().courierRankings[0].rawMetrics,
            totalAssignedRoutes: 2,
            completedRoutes: 1,
            incompleteRoutes: 1,
            deliveredStops: 2,
            onTimeDeliveredStops: 1,
            lateDeliveredStops: 1,
            qrConfirmedStops: 0,
            averageHandlingDurationSeconds: null,
            consistencyIssueCount: 1,
          },
        },
      ],
    })

    const { csv, filename, rowCount } = buildCourierAnalyticsCsv(result)
    expect(filename).toBe('courier-performance-all-time.csv')
    expect(rowCount).toBe(2)
    expect(csv.startsWith('\uFEFF')).toBe(true)
    const lines = csv.trim().split(/\r?\n/)
    expect(lines[0]).toContain('Rank')
    expect(lines[1]).toContain('Ada')
    expect(lines[1]).toContain('90')
    expect(lines[2]).toContain("'=Evil")
    expect(lines[2]).toContain(',80,')
  })
})
