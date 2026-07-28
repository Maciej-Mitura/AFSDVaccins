/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { CourierAnalyticsDataCompleteness } from '@vaccin-delivery/types'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}))

import FeatureCourierAnalyticsKpi from '@/components/feature/admin/analytics/FeatureCourierAnalyticsKpi.vue'
import FeatureCourierAnalyticsLeaderboard from '@/components/feature/admin/analytics/FeatureCourierAnalyticsLeaderboard.vue'
import FeatureCourierAnalyticsDetail from '@/components/feature/admin/analytics/FeatureCourierAnalyticsDetail.vue'
import type { RankingRow } from '@/composables/courier-analytics-mappers'

function ranking(partial: Partial<RankingRow> = {}): RankingRow {
  return {
    courierProfileId: 'p1',
    courierUserId: 'u1',
    displayName: 'Ada Courier',
    vehicleLabel: 'Van A',
    rank: 1,
    totalScore: 91.2,
    dataCompleteness: CourierAnalyticsDataCompleteness.Eligible,
    componentScores: {
      routeCompletion: 95,
      deliveryCompletion: 90,
      onTime: 88,
      qrConfirmation: 80,
      operationalConsistency: 92,
    },
    weightedContributions: {
      routeCompletion: 33.25,
      deliveryCompletion: 22.5,
      onTime: 17.6,
      qrConfirmation: 8,
      operationalConsistency: 9.2,
    },
    rawMetrics: {
      totalAssignedRoutes: 10,
      completedRoutes: 9,
      incompleteRoutes: 1,
      cancelledRoutes: 0,
      activeRoutes: 0,
      routeCompletionRate: 90,
      totalEligibleStops: 20,
      deliveredStops: 18,
      undeliveredOverdueStops: 2,
      deliveryCompletionRate: 90,
      totalOrdersDelivered: 25,
      totalVaccineQuantityDelivered: 80,
      deliveredStopsWithValidTimestamp: 18,
      onTimeDeliveredStops: 16,
      lateDeliveredStops: 2,
      onTimeDeliveryRate: 88.9,
      deliveredStopsWithValidProofMethod: 18,
      qrConfirmedStops: 14,
      qrConfirmationRate: 77.8,
      consistencyIssueCount: 1,
      consistencyEligibleUnits: 20,
      consistencyScore: 95,
      averageHandlingDurationSeconds: 400,
      medianHandlingDurationSeconds: 350,
      handlingDurationSampleCount: 10,
    },
    consistencyIssueBreakdown: {
      overdueIncompleteRoutes: 1,
      abandonedProcessingConfirmations: 0,
      invalidOrIncompleteProofs: 0,
    },
    ...partial,
  }
}

describe('courier analytics UI sections', () => {
  it('renders KPI card values', () => {
    const wrapper = mount(FeatureCourierAnalyticsKpi, {
      props: {
        cards: [
          {
            id: 'eligible',
            value: '3',
            labelKey: 'admin.courierAnalytics.kpi.eligibleCouriers',
          },
          {
            id: 'onTime',
            value: '—',
            labelKey: 'admin.courierAnalytics.kpi.overallOnTimeRate',
            insufficient: true,
          },
        ],
      },
      global: {
        stubs: { UCard: { template: '<div><slot /></div>' } },
      },
    })
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('admin.courierAnalytics.insufficientData')
    expect(wrapper.html()).toMatch(/text-warning/)
    expect(wrapper.html()).toMatch(/text-highlighted/)
  })

  it('shows official rank and highlights top three subtly', async () => {
    const rankings = [
      ranking({ rank: 1, courierProfileId: 'p1', displayName: 'Ada' }),
      ranking({
        rank: 2,
        courierProfileId: 'p2',
        displayName: 'Bob',
        totalScore: 80,
      }),
      ranking({
        rank: 3,
        courierProfileId: 'p3',
        displayName: 'Cara',
        totalScore: 70,
      }),
      ranking({
        rank: 4,
        courierProfileId: 'p4',
        displayName: 'Dan',
        totalScore: 0,
        dataCompleteness: CourierAnalyticsDataCompleteness.Insufficient,
      }),
    ]
    const wrapper = mount(FeatureCourierAnalyticsLeaderboard, {
      props: { rankings, selectedId: null },
    })
    expect(wrapper.text()).toContain('Ada')
    expect(wrapper.text()).toContain('admin.courierAnalytics.insufficientData')
    const rows = wrapper.findAll('tbody tr')
    expect(rows[0]?.classes().join(' ')).toMatch(/primary/)
    expect(wrapper.html()).toMatch(/text-warning/)
    expect(rows[3]?.text()).toContain('4')
    await rows[0]?.trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['p1'])
  })

  it('opens detail with component scores, weighted contributions, and consistency', async () => {
    const courier = ranking()
    const wrapper = mount(FeatureCourierAnalyticsDetail, {
      props: { courier },
      global: {
        stubs: {
          UCard: { template: '<div><slot /></div>' },
          UButton: {
            template:
              '<button type="button" @click="$emit(\'click\')"><slot /></button>',
          },
        },
      },
    })
    expect(
      wrapper.find('[data-testid="courier-analytics-detail"]').exists(),
    ).toBe(true)
    expect(wrapper.text()).toContain('91.2')
    expect(wrapper.text()).toContain(
      'admin.courierAnalytics.component.routeCompletion',
    )
    expect(wrapper.text()).toContain(
      'admin.courierAnalytics.weightedContribution',
    )
    expect(wrapper.text()).toContain(
      'admin.courierAnalytics.consistency.overdueIncomplete',
    )
    expect(wrapper.text()).toContain('10')
    expect(wrapper.text()).not.toMatch(/ObjectId|507f1f77/)
    await wrapper
      .find('[data-testid="courier-analytics-detail-close"]')
      .trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
