/**
 * Pure view-model mappers for Phase 32B courier analytics.
 * Never recalculate reliability scores — preserve backend values and order.
 */

import { CourierAnalyticsDataCompleteness } from '@vaccin-delivery/types'

import type { CourierPerformanceAnalyticsQuery } from '@/assets/graphql/courier-analytics'
import { translate } from '@/i18n'

export type AnalyticsPayload = NonNullable<
  CourierPerformanceAnalyticsQuery['courierPerformanceAnalytics']
>

export type RankingRow = AnalyticsPayload['courierRankings'][number]
export type SummaryVm = AnalyticsPayload['summary']
export type DataQualityVm = AnalyticsPayload['dataQuality']
export type MonthlyActivityVm = AnalyticsPayload['monthlyActivity'][number]
export type NamedCountVm = AnalyticsPayload['routeStatusDistribution'][number]

export type KpiCardVm = {
  id: string
  value: string
  labelKey: string
  supportKey?: string
  supportParams?: Record<string, string | number>
  insufficient?: boolean
}

export type ScoreBarItem = {
  courierProfileId: string
  displayName: string
  rank: number
  totalScore: number
  insufficient: boolean
}

export type ComponentMatrixRow = {
  courierProfileId: string
  displayName: string
  rank: number
  scores: {
    routeCompletion: number
    deliveryCompletion: number
    onTime: number
    qrConfirmation: number
    operationalConsistency: number
  }
  weighted: {
    routeCompletion: number
    deliveryCompletion: number
    onTime: number
    qrConfirmation: number
    operationalConsistency: number
  }
  insufficient: boolean
}

export type HandlingBarItem = {
  courierProfileId: string
  displayName: string
  rank: number
  averageSeconds: number
  medianSeconds: number | null
  sampleCount: number
}

export type DistributionSlice = {
  key: string
  count: number
  percentage: number
}

export type DetailPanelVm = RankingRow

const COMPONENT_KEYS = [
  'routeCompletion',
  'deliveryCompletion',
  'onTime',
  'qrConfirmation',
  'operationalConsistency',
] as const

export type ComponentKey = (typeof COMPONENT_KEYS)[number]

export { COMPONENT_KEYS }

export function isInsufficient(
  completeness: CourierAnalyticsDataCompleteness,
): boolean {
  return completeness === CourierAnalyticsDataCompleteness.Insufficient
}

export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return translate('common.emDash')
  }
  return value.toFixed(1)
}

export function formatRatePercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return translate('common.emDash')
  }
  return `${value.toFixed(1)}%`
}

export function formatHandlingDuration(
  seconds: number | null | undefined,
): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return translate('common.emDash')
  }
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) {
    return translate('admin.courierAnalytics.duration.hoursMinutes', {
      hours,
      minutes,
    })
  }
  if (minutes > 0) {
    return translate('admin.courierAnalytics.duration.minutesSeconds', {
      minutes,
      seconds: secs,
    })
  }
  return translate('admin.courierAnalytics.duration.secondsOnly', {
    seconds: secs,
  })
}

/**
 * Build KPI strip view models from summary — does not invent rates.
 */
export function mapKpiCards(summary: SummaryVm): KpiCardVm[] {
  return [
    {
      id: 'eligible',
      value: String(summary.couriersWithEligibleData),
      labelKey: 'admin.courierAnalytics.kpi.eligibleCouriers',
      supportKey: 'admin.courierAnalytics.kpi.eligibleSupport',
      supportParams: { total: summary.courierCount },
    },
    {
      id: 'completedRoutes',
      value: String(summary.totalCompletedRoutes),
      labelKey: 'admin.courierAnalytics.kpi.completedRoutes',
    },
    {
      id: 'deliveredStops',
      value: String(summary.totalDeliveredStops),
      labelKey: 'admin.courierAnalytics.kpi.deliveredStops',
    },
    {
      id: 'onTime',
      value: formatRatePercent(summary.overallOnTimeRate),
      labelKey: 'admin.courierAnalytics.kpi.overallOnTimeRate',
      insufficient: summary.overallOnTimeRate === null,
    },
    {
      id: 'qr',
      value: formatRatePercent(summary.overallQrConfirmationRate),
      labelKey: 'admin.courierAnalytics.kpi.overallQrRate',
      insufficient: summary.overallQrConfirmationRate === null,
    },
    {
      id: 'avgScore',
      value: formatScore(summary.averageReliabilityScore),
      labelKey: 'admin.courierAnalytics.kpi.averageReliabilityScore',
      insufficient: summary.averageReliabilityScore === null,
    },
  ]
}

/**
 * Preserve backend ranking order. Eligible score bars only for comparison chart
 * when excluding insufficient, or mark them distinguishable.
 */
export function mapScoreComparison(
  rankings: RankingRow[],
  options?: { includeInsufficient?: boolean },
): ScoreBarItem[] {
  const includeInsufficient = options?.includeInsufficient ?? false
  const items = rankings
    .filter(row => includeInsufficient || !isInsufficient(row.dataCompleteness))
    .map(row => ({
      courierProfileId: row.courierProfileId,
      displayName: row.displayName,
      rank: row.rank,
      totalScore: row.totalScore,
      insufficient: isInsufficient(row.dataCompleteness),
    }))
  // Backend already ranks descending by score among eligible; keep order.
  return items
}

export function mapComponentMatrix(
  rankings: RankingRow[],
  options?: { eligibleOnly?: boolean },
): ComponentMatrixRow[] {
  const eligibleOnly = options?.eligibleOnly ?? true
  return rankings
    .filter(row => !eligibleOnly || !isInsufficient(row.dataCompleteness))
    .map(row => ({
      courierProfileId: row.courierProfileId,
      displayName: row.displayName,
      rank: row.rank,
      scores: { ...row.componentScores },
      weighted: { ...row.weightedContributions },
      insufficient: isInsufficient(row.dataCompleteness),
    }))
}

/**
 * Chronological monthly activity — backend already returns activity months only.
 */
export function mapMonthlyActivityChronological(
  months: MonthlyActivityVm[],
): MonthlyActivityVm[] {
  return [...months].sort((a, b) => a.month.localeCompare(b.month))
}

export function mapDistribution(buckets: NamedCountVm[]): DistributionSlice[] {
  const total = buckets.reduce((sum, b) => sum + b.count, 0)
  return buckets.map(bucket => ({
    key: bucket.key,
    count: bucket.count,
    percentage: total > 0 ? (bucket.count / total) * 100 : 0,
  }))
}

/**
 * Exclude couriers with zero handling samples.
 */
export function mapHandlingDurations(
  rankings: RankingRow[],
): HandlingBarItem[] {
  const items: HandlingBarItem[] = []
  for (const row of rankings) {
    const averageSeconds = row.rawMetrics.averageHandlingDurationSeconds
    if (
      row.rawMetrics.handlingDurationSampleCount <= 0 ||
      typeof averageSeconds !== 'number' ||
      !Number.isFinite(averageSeconds)
    ) {
      continue
    }
    const medianRaw = row.rawMetrics.medianHandlingDurationSeconds
    items.push({
      courierProfileId: row.courierProfileId,
      displayName: row.displayName,
      rank: row.rank,
      averageSeconds,
      medianSeconds: typeof medianRaw === 'number' ? medianRaw : null,
      sampleCount: row.rawMetrics.handlingDurationSampleCount,
    })
  }
  return items.sort((a, b) => a.averageSeconds - b.averageSeconds)
}

export function hasMeaningfulAnalytics(payload: AnalyticsPayload): boolean {
  return (
    payload.summary.totalAssignedRoutes > 0 ||
    payload.courierRankings.length > 0
  )
}

export function hasDataQualityIssues(dq: DataQualityVm): boolean {
  return (
    dq.legacyRoutesWithoutRequiredFields > 0 ||
    dq.deliveredStopsWithoutTimestamp > 0 ||
    dq.invalidStopSequences > 0 ||
    dq.missingOrders > 0 ||
    dq.invalidHandlingDurations > 0 ||
    dq.malformedProofs > 0
  )
}

export function findRankingById(
  rankings: RankingRow[],
  courierProfileId: string | null,
): DetailPanelVm | null {
  if (!courierProfileId) {
    return null
  }
  return rankings.find(r => r.courierProfileId === courierProfileId) ?? null
}
