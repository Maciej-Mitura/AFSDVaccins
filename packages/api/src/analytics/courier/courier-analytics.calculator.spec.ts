import {
  average,
  calculateCourierPerformanceAnalytics,
  clampScore,
  compareCourierRankings,
  median,
  rateOrNull,
  roundScore,
  scoreFromRate,
  sumReliabilityWeights,
} from './courier-analytics.calculator'
import { CourierAnalyticsDataCompleteness } from './courier-analytics.definitions'
import type {
  AnalyticsCourierIdentity,
  AnalyticsRouteInput,
  CourierRankingRow,
} from './courier-analytics.types'

const TIME_ZONE = 'Europe/Brussels'
const TODAY = '2026-07-15'

function courier(
  id: string,
  name: string,
  userId = `user-${id}`,
): AnalyticsCourierIdentity {
  return {
    courierProfileId: id,
    courierUserId: userId,
    displayName: name,
    vehicleLabel: null,
  }
}

function route(
  partial: Partial<AnalyticsRouteInput> &
    Pick<AnalyticsRouteInput, 'id' | 'bezorgerProfileId' | 'deliveryDate' | 'status'>,
): AnalyticsRouteInput {
  return {
    stops: [],
    ...partial,
  }
}

function deliveredStop(opts: {
  stopId: string
  method?: string
  deliveredAt?: string
  arrivalAt?: string
  orderCount?: number
  orderIds?: string[]
  totalQuantity?: number
  associatedOrderIds?: string[]
  sequence?: number
}) {
  return {
    stopId: opts.stopId,
    sequence: opts.sequence ?? 1,
    orderCount: opts.orderCount ?? opts.orderIds?.length ?? 1,
    orderIds: opts.orderIds ?? ['o1'],
    totalQuantity: opts.totalQuantity ?? 10,
    arrival: opts.arrivalAt
      ? { recordedAt: new Date(opts.arrivalAt) }
      : undefined,
    deliveryProof: {
      method: opts.method ?? 'QR',
      deliveredAt: opts.deliveredAt
        ? new Date(opts.deliveredAt)
        : new Date('2026-07-10T12:00:00.000Z'),
      associatedOrderIds: opts.associatedOrderIds,
    },
  }
}

function calc(
  routes: AnalyticsRouteInput[],
  couriers: AnalyticsCourierIdentity[],
  today = TODAY,
) {
  return calculateCourierPerformanceAnalytics({
    routes,
    couriers,
    zeroRouteBezorgerProfileCount: 0,
    todayLocalDate: today,
    timeZone: TIME_ZONE,
    generatedAt: new Date('2026-07-15T10:00:00.000Z'),
  })
}

describe('courier analytics calculator', () => {
  it('1. score weights total 100%', () => {
    expect(sumReliabilityWeights()).toBeCloseTo(1, 10)
  })

  it('2. every component is clamped 0–100', () => {
    expect(clampScore(-5)).toBe(0)
    expect(clampScore(150)).toBe(100)
    expect(clampScore(50)).toBe(50)
  })

  it('3. total score is calculated accurately', () => {
    const result = calc(
      [
        route({
          id: 'r1',
          bezorgerProfileId: 'c1',
          deliveryDate: '2026-07-10',
          status: 'COMPLETED',
          stops: [
            deliveredStop({
              stopId: 's1',
              method: 'QR',
              deliveredAt: '2026-07-10T10:00:00.000Z',
              arrivalAt: '2026-07-10T09:00:00.000Z',
            }),
          ],
        }),
      ],
      [courier('c1', 'Ada')],
    )

    const row = result.courierRankings[0]
    // Perfect rates → each component 100 → total 100
    expect(row.componentScores.routeCompletion).toBe(100)
    expect(row.componentScores.deliveryCompletion).toBe(100)
    expect(row.componentScores.onTime).toBe(100)
    expect(row.componentScores.qrConfirmation).toBe(100)
    expect(row.totalScore).toBe(100)
    const sumContrib =
      row.weightedContributions.routeCompletion +
      row.weightedContributions.deliveryCompletion +
      row.weightedContributions.onTime +
      row.weightedContributions.qrConfirmation +
      row.weightedContributions.operationalConsistency
    expect(sumContrib).toBeCloseTo(row.totalScore, 2)
  })

  it('4. no-data courier is not ranked misleadingly', () => {
    const result = calc(
      [
        route({
          id: 'r1',
          bezorgerProfileId: 'c1',
          deliveryDate: '2026-07-20',
          status: 'ASSIGNED',
          stops: [{ stopId: 's1', sequence: 1, orderIds: ['o1'], orderCount: 1 }],
        }),
        route({
          id: 'r2',
          bezorgerProfileId: 'c2',
          deliveryDate: '2026-07-10',
          status: 'COMPLETED',
          stops: [
            deliveredStop({
              stopId: 's2',
              deliveredAt: '2026-07-10T12:00:00.000Z',
            }),
          ],
        }),
      ],
      [courier('c1', 'No Data'), courier('c2', 'Active')],
    )

    expect(result.courierRankings[0].courierProfileId).toBe('c2')
    expect(result.courierRankings[1].dataCompleteness).toBe(
      CourierAnalyticsDataCompleteness.INSUFFICIENT,
    )
    expect(result.courierRankings[1].totalScore).toBe(0)
  })

  it('5. ranking ties use documented order', () => {
    const base: CourierRankingRow = {
      courierProfileId: 'b',
      courierUserId: 'u',
      displayName: 'Bob',
      vehicleLabel: null,
      rank: 0,
      totalScore: 50,
      dataCompleteness: CourierAnalyticsDataCompleteness.ELIGIBLE,
      componentScores: {
        routeCompletion: 50,
        deliveryCompletion: 50,
        onTime: 50,
        qrConfirmation: 50,
        operationalConsistency: 50,
      },
      weightedContributions: {
        routeCompletion: 0,
        deliveryCompletion: 0,
        onTime: 0,
        qrConfirmation: 0,
        operationalConsistency: 0,
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
        totalVaccineQuantityDelivered: 1,
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
        averageHandlingDurationSeconds: null,
        medianHandlingDurationSeconds: null,
        handlingDurationSampleCount: 0,
      },
      consistencyIssueBreakdown: {
        overdueIncompleteRoutes: 0,
        abandonedProcessingConfirmations: 0,
        invalidOrIncompleteProofs: 0,
      },
    }

    const a = {
      ...base,
      courierProfileId: 'a',
      displayName: 'Ann',
      rawMetrics: { ...base.rawMetrics, deliveredStops: 2, completedRoutes: 1 },
    }
    const c = {
      ...base,
      courierProfileId: 'c',
      displayName: 'Ann',
      rawMetrics: { ...base.rawMetrics, deliveredStops: 2, completedRoutes: 1 },
    }
    expect(compareCourierRankings(a, c)).toBeLessThan(0)
  })

  it('6. cancelled routes do not reduce completion score', () => {
    const result = calc(
      [
        route({
          id: 'r1',
          bezorgerProfileId: 'c1',
          deliveryDate: '2026-07-01',
          status: 'COMPLETED',
          stops: [],
        }),
        route({
          id: 'r2',
          bezorgerProfileId: 'c1',
          deliveryDate: '2026-07-02',
          status: 'CANCELLED',
          stops: [],
        }),
      ],
      [courier('c1', 'Ada')],
    )
    expect(result.courierRankings[0].rawMetrics.routeCompletionRate).toBe(1)
    expect(result.courierRankings[0].rawMetrics.cancelledRoutes).toBe(1)
  })

  it('7. overdue incomplete routes reduce completion score', () => {
    const result = calc(
      [
        route({
          id: 'r1',
          bezorgerProfileId: 'c1',
          deliveryDate: '2026-07-01',
          status: 'COMPLETED',
          stops: [],
        }),
        route({
          id: 'r2',
          bezorgerProfileId: 'c1',
          deliveryDate: '2026-07-01',
          status: 'ASSIGNED',
          stops: [],
        }),
      ],
      [courier('c1', 'Ada')],
    )
    expect(result.courierRankings[0].rawMetrics.incompleteRoutes).toBe(1)
    expect(result.courierRankings[0].rawMetrics.routeCompletionRate).toBe(0.5)
  })

  it('8. future/active routes do not reduce completion score', () => {
    const result = calc(
      [
        route({
          id: 'r1',
          bezorgerProfileId: 'c1',
          deliveryDate: '2026-07-01',
          status: 'COMPLETED',
          stops: [],
        }),
        route({
          id: 'r2',
          bezorgerProfileId: 'c1',
          deliveryDate: '2026-07-20',
          status: 'ASSIGNED',
          stops: [],
        }),
      ],
      [courier('c1', 'Ada')],
    )
    expect(result.courierRankings[0].rawMetrics.routeCompletionRate).toBe(1)
    expect(result.courierRankings[0].rawMetrics.activeRoutes).toBe(1)
  })

  it('9. delivered stop counts once regardless of order count', () => {
    const result = calc(
      [
        route({
          id: 'r1',
          bezorgerProfileId: 'c1',
          deliveryDate: '2026-07-10',
          status: 'COMPLETED',
          stops: [
            deliveredStop({
              stopId: 's1',
              orderCount: 5,
              orderIds: ['a', 'b', 'c', 'd', 'e'],
              associatedOrderIds: ['a', 'b', 'c', 'd', 'e'],
              totalQuantity: 50,
              deliveredAt: '2026-07-10T12:00:00.000Z',
            }),
          ],
        }),
      ],
      [courier('c1', 'Ada')],
    )
    expect(result.courierRankings[0].rawMetrics.deliveredStops).toBe(1)
  })

  it('10. multi-order stop contributes correct order totals', () => {
    const result = calc(
      [
        route({
          id: 'r1',
          bezorgerProfileId: 'c1',
          deliveryDate: '2026-07-10',
          status: 'COMPLETED',
          stops: [
            deliveredStop({
              stopId: 's1',
              associatedOrderIds: ['a', 'b', 'c'],
              totalQuantity: 30,
              deliveredAt: '2026-07-10T12:00:00.000Z',
            }),
          ],
        }),
      ],
      [courier('c1', 'Ada')],
    )
    expect(result.courierRankings[0].rawMetrics.totalOrdersDelivered).toBe(3)
    expect(
      result.courierRankings[0].rawMetrics.totalVaccineQuantityDelivered,
    ).toBe(30)
  })

  it('11. same Brussels delivery date counts as on time', () => {
    // 2026-07-10 22:00 UTC = 2026-07-11 00:00 Brussels (CEST) — late
    // Use midday UTC which is still 2026-07-10 in Brussels
    const result = calc(
      [
        route({
          id: 'r1',
          bezorgerProfileId: 'c1',
          deliveryDate: '2026-07-10',
          status: 'COMPLETED',
          stops: [
            deliveredStop({
              stopId: 's1',
              deliveredAt: '2026-07-10T10:00:00.000Z',
            }),
          ],
        }),
      ],
      [courier('c1', 'Ada')],
    )
    expect(result.courierRankings[0].rawMetrics.onTimeDeliveredStops).toBe(1)
    expect(result.courierRankings[0].rawMetrics.onTimeDeliveryRate).toBe(1)
  })

  it('12. later date counts as late', () => {
    const result = calc(
      [
        route({
          id: 'r1',
          bezorgerProfileId: 'c1',
          deliveryDate: '2026-07-10',
          status: 'COMPLETED',
          stops: [
            deliveredStop({
              stopId: 's1',
              deliveredAt: '2026-07-11T10:00:00.000Z',
            }),
          ],
        }),
      ],
      [courier('c1', 'Ada')],
    )
    expect(result.courierRankings[0].rawMetrics.lateDeliveredStops).toBe(1)
    expect(result.courierRankings[0].rawMetrics.onTimeDeliveryRate).toBe(0)
  })

  it('13. missing timestamp counts as unknown', () => {
    const result = calc(
      [
        route({
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
              totalQuantity: 1,
              deliveryProof: { method: 'QR', deliveredAt: null },
            },
          ],
        }),
      ],
      [courier('c1', 'Ada')],
    )
    expect(
      result.courierRankings[0].rawMetrics.deliveredStopsWithValidTimestamp,
    ).toBe(0)
    expect(
      result.deliveryTimelinessDistribution.find((b) => b.key === 'UNKNOWN')
        ?.count,
    ).toBe(1)
    expect(result.dataQuality.deliveredStopsWithoutTimestamp).toBe(1)
  })

  it('14. QR proof uses deliveryProof.method only', () => {
    const result = calc(
      [
        route({
          id: 'r1',
          bezorgerProfileId: 'c1',
          deliveryDate: '2026-07-10',
          status: 'COMPLETED',
          stops: [
            deliveredStop({
              stopId: 's1',
              method: 'QR',
              deliveredAt: '2026-07-10T10:00:00.000Z',
            }),
          ],
        }),
      ],
      [courier('c1', 'Ada')],
    )
    expect(result.courierRankings[0].rawMetrics.qrConfirmedStops).toBe(1)
  })

  it('15. ADMIN proof is not QR', () => {
    const result = calc(
      [
        route({
          id: 'r1',
          bezorgerProfileId: 'c1',
          deliveryDate: '2026-07-10',
          status: 'COMPLETED',
          stops: [
            deliveredStop({
              stopId: 's1',
              method: 'ADMIN',
              deliveredAt: '2026-07-10T10:00:00.000Z',
            }),
          ],
        }),
      ],
      [courier('c1', 'Ada')],
    )
    expect(result.courierRankings[0].rawMetrics.qrConfirmedStops).toBe(0)
    expect(result.courierRankings[0].rawMetrics.qrConfirmationRate).toBe(0)
    expect(
      result.deliveryProofDistribution.find((b) => b.key === 'ADMIN')?.count,
    ).toBe(1)
  })

  it('16. consistency excludes admin-cancelled route', () => {
    const result = calc(
      [
        route({
          id: 'r1',
          bezorgerProfileId: 'c1',
          deliveryDate: '2026-07-01',
          status: 'CANCELLED',
          stops: [{ stopId: 's1', sequence: 1, orderIds: ['o1'], orderCount: 1 }],
        }),
        route({
          id: 'r2',
          bezorgerProfileId: 'c1',
          deliveryDate: '2026-07-10',
          status: 'COMPLETED',
          stops: [
            deliveredStop({
              stopId: 's2',
              deliveredAt: '2026-07-10T10:00:00.000Z',
            }),
          ],
        }),
      ],
      [courier('c1', 'Ada')],
    )
    expect(
      result.courierRankings[0].consistencyIssueBreakdown
        .overdueIncompleteRoutes,
    ).toBe(0)
  })

  it('17. consistency issue is not double-counted', () => {
    const result = calc(
      [
        route({
          id: 'r1',
          bezorgerProfileId: 'c1',
          deliveryDate: '2026-07-01',
          status: 'IN_PROGRESS',
          stops: [
            {
              stopId: 's1',
              sequence: 1,
              orderIds: ['o1'],
              orderCount: 1,
              confirmationProcess: { state: 'PROCESSING' },
            },
          ],
        }),
      ],
      [courier('c1', 'Ada')],
    )
    const row = result.courierRankings[0]
    expect(row.consistencyIssueBreakdown.overdueIncompleteRoutes).toBe(1)
    expect(
      row.consistencyIssueBreakdown.abandonedProcessingConfirmations,
    ).toBe(1)
    expect(row.rawMetrics.consistencyIssueCount).toBe(2)
  })

  it('18. invalid durations are excluded and diagnosed', () => {
    const result = calc(
      [
        route({
          id: 'r1',
          bezorgerProfileId: 'c1',
          deliveryDate: '2026-07-10',
          status: 'COMPLETED',
          stops: [
            deliveredStop({
              stopId: 's1',
              arrivalAt: '2026-07-10T12:00:00.000Z',
              deliveredAt: '2026-07-10T11:00:00.000Z',
            }),
          ],
        }),
      ],
      [courier('c1', 'Ada')],
    )
    expect(
      result.courierRankings[0].rawMetrics.handlingDurationSampleCount,
    ).toBe(0)
    expect(result.dataQuality.invalidHandlingDurations).toBe(1)
  })

  it('19. average duration is correct', () => {
    expect(average([10, 20, 30])).toBe(20)
    expect(average([])).toBeNull()
  })

  it('20. median duration is correct', () => {
    expect(median([10, 30, 20])).toBe(20)
    expect(median([10, 20])).toBe(15)
    expect(median([])).toBeNull()
  })

  it('supports rateOrNull and scoreFromRate no-data policy', () => {
    expect(rateOrNull(1, 0)).toBeNull()
    expect(scoreFromRate(null)).toBe(0)
    expect(roundScore(12.345)).toBe(12.35)
  })

  it('builds chronological monthly buckets', () => {
    const result = calc(
      [
        route({
          id: 'r1',
          bezorgerProfileId: 'c1',
          deliveryDate: '2026-03-01',
          status: 'COMPLETED',
          stops: [
            deliveredStop({
              stopId: 's1',
              deliveredAt: '2026-03-01T10:00:00.000Z',
            }),
          ],
        }),
        route({
          id: 'r2',
          bezorgerProfileId: 'c1',
          deliveryDate: '2026-01-01',
          status: 'COMPLETED',
          stops: [
            deliveredStop({
              stopId: 's2',
              deliveredAt: '2026-01-01T10:00:00.000Z',
            }),
          ],
        }),
      ],
      [courier('c1', 'Ada')],
    )
    expect(result.monthlyActivity.map((m) => m.month)).toEqual([
      '2026-01',
      '2026-03',
    ])
  })

  it('does not crash on legacy routes missing newer fields', () => {
    expect(() =>
      calc(
        [
          route({
            id: 'legacy',
            bezorgerProfileId: 'c1',
            deliveryDate: '2025-01-01',
            status: 'COMPLETED',
            stops: [
              {
                sequence: 1,
                orderIds: ['o1'],
                orderCount: 1,
                totalQuantity: 2,
              },
            ],
          }),
        ],
        [courier('c1', 'Ada')],
      ),
    ).not.toThrow()
  })
})
