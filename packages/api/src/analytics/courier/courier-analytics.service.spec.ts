import { CacheKeys } from '../../common/cache/cache-keys'
import type { Clock } from '../../order/clock.provider'
import { UserRole } from '../../user/user-role.enum'
import { CourierAnalyticsAuditService } from './courier-analytics-audit.service'
import { CourierAnalyticsDataCompleteness } from './courier-analytics.definitions'
import {
  CourierAnalyticsForbiddenException,
  CourierAnalyticsExportFailedException,
} from './courier-analytics.exceptions'
import { CourierAnalyticsRepository } from './courier-analytics.repository'
import { CourierAnalyticsService } from './courier-analytics.service'
import type { CourierPerformanceAnalyticsResult } from './courier-analytics.types'

function adminUser() {
  return { _id: 'admin-1', role: UserRole.ADMIN } as never
}

function bezorgerUser() {
  return { _id: 'bez-1', role: UserRole.BEZORGER } as never
}

function apothekerUser() {
  return { _id: 'apo-1', role: UserRole.APOTHEKER } as never
}

function sampleAnalytics(): CourierPerformanceAnalyticsResult {
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
          averageHandlingDurationSeconds: 60,
          medianHandlingDurationSeconds: 60,
          handlingDurationSampleCount: 1,
        },
        consistencyIssueBreakdown: {
          overdueIncompleteRoutes: 0,
          abandonedProcessingConfirmations: 0,
          invalidOrIncompleteProofs: 0,
        },
      },
    ],
    monthlyActivity: [
      {
        month: '2026-07',
        assignedRoutes: 1,
        completedRoutes: 1,
        deliveredStops: 1,
        deliveredOrders: 1,
        deliveredVaccineQuantity: 10,
        onTimeStops: 1,
        lateStops: 0,
      },
    ],
    routeStatusDistribution: [{ key: 'COMPLETED', count: 1 }],
    deliveryTimelinessDistribution: [{ key: 'ON_TIME', count: 1 }],
    deliveryProofDistribution: [{ key: 'QR', count: 1 }],
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

describe('CourierAnalyticsService', () => {
  let repository: jest.Mocked<Pick<CourierAnalyticsRepository, 'loadAllTimeDataset'>>
  let settingsService: { getApplicationSettings: jest.Mock }
  let cache: {
    getOrSet: jest.Mock
    invalidate: jest.Mock
  }
  let auditService: jest.Mocked<Pick<CourierAnalyticsAuditService, 'recordExport'>>
  let clock: Clock
  let service: CourierAnalyticsService

  beforeEach(() => {
    repository = {
      loadAllTimeDataset: jest.fn().mockResolvedValue({
        routes: [
          {
            id: 'r1',
            bezorgerProfileId: 'c1',
            deliveryDate: '2026-07-10',
            status: 'COMPLETED',
            stops: [
              {
                stopId: 's1',
                sequence: 1,
                orderIds: ['o1'],
                orderCount: 1,
                totalQuantity: 10,
                arrival: { recordedAt: new Date('2026-07-10T09:00:00.000Z') },
                deliveryProof: {
                  method: 'QR',
                  deliveredAt: new Date('2026-07-10T10:00:00.000Z'),
                  associatedOrderIds: ['o1'],
                },
              },
            ],
          },
        ],
        couriers: [
          {
            courierProfileId: 'c1',
            courierUserId: 'u1',
            displayName: 'Ada',
            vehicleLabel: 'Bike-1',
          },
        ],
        zeroRouteBezorgerProfileCount: 1,
      }),
    }
    settingsService = {
      getApplicationSettings: jest.fn().mockResolvedValue({
        timezone: 'Europe/Brussels',
      }),
    }
    cache = {
      getOrSet: jest.fn(<T>(_key: string, loader: () => Promise<T>) => loader()),
      invalidate: jest.fn().mockResolvedValue(undefined),
    }
    auditService = {
      recordExport: jest.fn().mockResolvedValue(undefined),
    }
    clock = {
      now: () => new Date('2026-07-15T10:00:00.000Z'),
    }
    service = new CourierAnalyticsService(
      repository as never,
      settingsService as never,
      cache as never,
      auditService as never,
      clock,
    )
  })

  it('21. ADMIN may query analytics', async () => {
    const result = await service.getCourierPerformanceAnalytics(adminUser())
    expect(result.courierRankings).toHaveLength(1)
    expect(result.generatedAt.toISOString()).toBe('2026-07-15T10:00:00.000Z')
    expect(result.summary.currentBezorgerProfilesWithZeroRoutes).toBe(1)
  })

  it('22. BEZORGER rejected', async () => {
    await expect(
      service.getCourierPerformanceAnalytics(bezorgerUser()),
    ).rejects.toBeInstanceOf(CourierAnalyticsForbiddenException)
  })

  it('23. APOTHEKER rejected', async () => {
    await expect(
      service.getCourierPerformanceAnalytics(apothekerUser()),
    ).rejects.toBeInstanceOf(CourierAnalyticsForbiddenException)
  })

  it('25. summary aggregate rates use global denominators', async () => {
    const result = await service.getCourierPerformanceAnalytics(adminUser())
    expect(result.summary.overallRouteCompletionRate).toBe(1)
    expect(result.summary.overallDeliveryCompletionRate).toBe(1)
  })

  it('26. ranking output is deterministic', async () => {
    const a = await service.getCourierPerformanceAnalytics(adminUser())
    const b = await service.getCourierPerformanceAnalytics(adminUser())
    expect(a.courierRankings.map((r) => r.courierProfileId)).toEqual(
      b.courierRankings.map((r) => r.courierProfileId),
    )
  })

  it('34/36. cache key used and generatedAt exposed', async () => {
    await service.getCourierPerformanceAnalytics(adminUser())
    expect(cache.getOrSet).toHaveBeenCalledWith(
      CacheKeys.courierPerformanceAnalyticsAllTime(),
      expect.any(Function),
      5 * 60 * 1000,
    )
  })

  it('refresh invalidates cache', async () => {
    await service.getCourierPerformanceAnalytics(adminUser(), { refresh: true })
    expect(cache.invalidate).toHaveBeenCalledWith(
      CacheKeys.courierPerformanceAnalyticsAllTime(),
    )
  })

  it('37. result does not expose sensitive fields', async () => {
    const result = await service.getCourierPerformanceAnalytics(adminUser())
    const json = JSON.stringify(result)
    expect(json).not.toMatch(/firebase/i)
    expect(json).not.toMatch(/encodedToken/)
    expect(json).not.toMatch(/nonceHash/)
    expect(json).not.toMatch(/@/)
  })

  it('39. ADMIN can download CSV', async () => {
    const exportResult = await service.exportCourierPerformanceCsv(adminUser())
    expect(exportResult.contentType).toBe('text/csv; charset=utf-8')
    expect(exportResult.filename).toBe('courier-performance-all-time.csv')
    expect(exportResult.csvBytes.toString('utf8')).toContain('Ada')
    expect(auditService.recordExport).toHaveBeenCalledTimes(1)
  })

  it('40. non-admin CSV rejected', async () => {
    await expect(
      service.exportCourierPerformanceCsv(bezorgerUser()),
    ).rejects.toBeInstanceOf(CourierAnalyticsForbiddenException)
    expect(auditService.recordExport).not.toHaveBeenCalled()
  })

  it('47. failed export writes no successful audit', async () => {
    auditService.recordExport.mockRejectedValueOnce(new Error('db down'))
    await expect(
      service.exportCourierPerformanceCsv(adminUser()),
    ).rejects.toBeInstanceOf(CourierAnalyticsExportFailedException)
  })

  it('returns cached analytics object within TTL path', async () => {
    const cached = sampleAnalytics()
    cache.getOrSet.mockResolvedValueOnce(cached)
    const result = await service.getCourierPerformanceAnalytics(adminUser())
    expect(result).toBe(cached)
    expect(repository.loadAllTimeDataset).not.toHaveBeenCalled()
  })
})
