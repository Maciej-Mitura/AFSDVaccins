/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'

import router from '@/router'
import {
  buildComponentMatrixOption,
  buildDonutOption,
  buildHandlingDurationOption,
  buildMonthlyActivityOption,
  buildScoreComparisonOption,
} from '@/components/feature/admin/analytics/courier-chart-options'
import type {
  ComponentMatrixRow,
  HandlingBarItem,
  MonthlyActivityVm,
  ScoreBarItem,
} from '@/composables/courier-analytics-mappers'

const t = (key: string) => key

describe('admin courier analytics access', () => {
  it('resolves ADMIN courier analytics route', () => {
    const resolved = router.resolve('/admin/analytics/couriers')
    expect(resolved.name).toBe('admin-courier-analytics')
  })

  it('keeps analytics under ADMIN parent role meta', () => {
    const matched = router.resolve('/admin/analytics/couriers').matched
    const adminParent = matched.find(r => r.path === '/admin')
    expect(adminParent?.meta.role).toBe('ADMIN')
  })

  it('does not expose courier analytics under bezorger or apotheker trees', () => {
    expect(router.resolve('/bezorger/analytics/couriers').name).toBe(
      'not-found',
    )
    expect(router.resolve('/apotheker/analytics/couriers').name).toBe(
      'not-found',
    )
  })
})

describe('courier chart options', () => {
  it('builds descending score comparison on 0–100 axis', () => {
    const items: ScoreBarItem[] = [
      {
        courierProfileId: 'a',
        displayName: 'Ada',
        rank: 1,
        totalScore: 90,
        insufficient: false,
      },
      {
        courierProfileId: 'b',
        displayName: 'Bob',
        rank: 2,
        totalScore: 70,
        insufficient: false,
      },
    ]
    const option = buildScoreComparisonOption(items, t)
    expect(option.xAxis).toMatchObject({ min: 0, max: 100 })
    expect((option.yAxis as { data: string[] }).data).toEqual(['Ada', 'Bob'])
  })

  it('builds five component series', () => {
    const rows: ComponentMatrixRow[] = [
      {
        courierProfileId: 'a',
        displayName: 'Ada',
        rank: 1,
        insufficient: false,
        scores: {
          routeCompletion: 90,
          deliveryCompletion: 80,
          onTime: 70,
          qrConfirmation: 60,
          operationalConsistency: 50,
        },
        weighted: {
          routeCompletion: 31.5,
          deliveryCompletion: 20,
          onTime: 14,
          qrConfirmation: 6,
          operationalConsistency: 5,
        },
      },
    ]
    const option = buildComponentMatrixOption(rows, t)
    expect(option.series).toHaveLength(5)
  })

  it('builds chronological monthly series without vaccine quantity', () => {
    const months: MonthlyActivityVm[] = [
      {
        month: '2026-01',
        assignedRoutes: 1,
        completedRoutes: 1,
        deliveredStops: 2,
        deliveredOrders: 3,
        deliveredVaccineQuantity: 999,
        onTimeStops: 2,
        lateStops: 0,
      },
    ]
    const option = buildMonthlyActivityOption(months, t)
    const names = (option.series as Array<{ name: string }>).map(s => s.name)
    expect(names).toHaveLength(3)
    expect(names.join(' ')).not.toMatch(/vaccine|quantity/i)
  })

  it('maps donut categories with count-ready data', () => {
    const option = buildDonutOption(
      [
        { key: 'QR', count: 8, percentage: 80 },
        { key: 'ADMIN', count: 2, percentage: 20 },
      ],
      key => key,
      t,
    )
    expect((option.series as Array<{ data: unknown[] }>)[0]?.data).toHaveLength(
      2,
    )
  })

  it('builds handling chart with sample metadata', () => {
    const items: HandlingBarItem[] = [
      {
        courierProfileId: 'a',
        displayName: 'Ada',
        rank: 1,
        averageSeconds: 300,
        medianSeconds: 280,
        sampleCount: 4,
      },
    ]
    const option = buildHandlingDurationOption(items, t)
    const data = (
      option.series as Array<{ data: Array<{ sampleCount: number }> }>
    )[0]?.data
    expect(data?.[0]?.sampleCount).toBe(4)
  })
})
