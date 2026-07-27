import { getLocalCalendarDate } from '../../order/delivery-date.util'
import {
  COURIER_ANALYTICS_SCORE_DECIMALS,
} from './courier-analytics.constants'
import {
  CONSISTENCY_ISSUE_TYPES,
  COURIER_RELIABILITY_WEIGHTS,
  CourierAnalyticsDataCompleteness,
  DELIVERY_PROOF_DISTRIBUTION_KEYS,
  DELIVERY_TIMELINESS_DISTRIBUTION_KEYS,
  ROUTE_STATUS_DISTRIBUTION_KEYS,
} from './courier-analytics.definitions'
import type {
  AnalyticsCourierIdentity,
  AnalyticsRouteInput,
  AnalyticsStopInput,
  CourierAnalyticsDataQuality,
  CourierComponentScores,
  CourierConsistencyIssueBreakdown,
  CourierPerformanceAnalyticsResult,
  CourierRankingRow,
  CourierRawMetrics,
  CourierWeightedContributions,
  MonthlyActivityBucket,
  NamedCountBucket,
} from './courier-analytics.types'

const WEIGHTS = COURIER_RELIABILITY_WEIGHTS

export type CalculateCourierPerformanceInput = {
  routes: AnalyticsRouteInput[]
  couriers: AnalyticsCourierIdentity[]
  /** Profiles that currently exist as BEZORGER but have zero assigned routes. */
  zeroRouteBezorgerProfileCount: number
  /** "Today" as YYYY-MM-DD in the application timezone. */
  todayLocalDate: string
  timeZone: string
  generatedAt: Date
}

type MutableCourierAcc = {
  identity: AnalyticsCourierIdentity
  totalAssignedRoutes: number
  completedRoutes: number
  incompleteRoutes: number
  cancelledRoutes: number
  activeRoutes: number
  deliveredStops: number
  undeliveredOverdueStops: number
  totalOrdersDelivered: number
  totalVaccineQuantityDelivered: number
  deliveredStopsWithValidTimestamp: number
  onTimeDeliveredStops: number
  lateDeliveredStops: number
  deliveredStopsWithValidProofMethod: number
  qrConfirmedStops: number
  handlingDurationsSeconds: number[]
  consistencyBreakdown: CourierConsistencyIssueBreakdown
  issueKeys: Set<string>
}

type GlobalAcc = {
  routeStatus: Record<string, number>
  timeliness: Record<string, number>
  proof: Record<string, number>
  monthly: Map<string, MonthlyActivityBucket>
  dataQuality: CourierAnalyticsDataQuality
  overallCompletedRoutes: number
  overallIncompleteRoutes: number
  overallDeliveredStops: number
  overallUndeliveredOverdueStops: number
  overallOnTime: number
  overallLate: number
  overallWithTimestamp: number
  overallQr: number
  overallValidProofMethod: number
  overallDeliveredOrders: number
  overallDeliveredQty: number
  overallCancelledRoutes: number
  overallAssignedRoutes: number
}

function emptyBreakdown(): CourierConsistencyIssueBreakdown {
  return {
    overdueIncompleteRoutes: 0,
    abandonedProcessingConfirmations: 0,
    invalidOrIncompleteProofs: 0,
  }
}

function emptyDataQuality(): CourierAnalyticsDataQuality {
  return {
    legacyRoutesWithoutRequiredFields: 0,
    deliveredStopsWithoutTimestamp: 0,
    invalidStopSequences: 0,
    missingOrders: 0,
    invalidHandlingDurations: 0,
    malformedProofs: 0,
  }
}

function emptyMonthly(month: string): MonthlyActivityBucket {
  return {
    month,
    assignedRoutes: 0,
    completedRoutes: 0,
    deliveredStops: 0,
    deliveredOrders: 0,
    deliveredVaccineQuantity: 0,
    onTimeStops: 0,
    lateStops: 0,
  }
}

function createGlobalAcc(): GlobalAcc {
  const routeStatus: Record<string, number> = {}
  for (const key of ROUTE_STATUS_DISTRIBUTION_KEYS) {
    routeStatus[key] = 0
  }
  const timeliness: Record<string, number> = {}
  for (const key of DELIVERY_TIMELINESS_DISTRIBUTION_KEYS) {
    timeliness[key] = 0
  }
  const proof: Record<string, number> = {}
  for (const key of DELIVERY_PROOF_DISTRIBUTION_KEYS) {
    proof[key] = 0
  }
  return {
    routeStatus,
    timeliness,
    proof,
    monthly: new Map(),
    dataQuality: emptyDataQuality(),
    overallCompletedRoutes: 0,
    overallIncompleteRoutes: 0,
    overallDeliveredStops: 0,
    overallUndeliveredOverdueStops: 0,
    overallOnTime: 0,
    overallLate: 0,
    overallWithTimestamp: 0,
    overallQr: 0,
    overallValidProofMethod: 0,
    overallDeliveredOrders: 0,
    overallDeliveredQty: 0,
    overallCancelledRoutes: 0,
    overallAssignedRoutes: 0,
  }
}

export function roundScore(value: number, decimals = COURIER_ANALYTICS_SCORE_DECIMALS): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  if (value < 0) {
    return 0
  }
  if (value > 100) {
    return 100
  }
  return value
}

export function rateOrNull(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null
  }
  return numerator / denominator
}

export function scoreFromRate(rate: number | null): number {
  if (rate == null) {
    return 0
  }
  return clampScore(rate * 100)
}

export function median(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

export function average(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }
  let sum = 0
  for (const value of values) {
    sum += value
  }
  return sum / values.length
}

export function toValidDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

export function monthKeyFromDeliveryDate(deliveryDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
    return null
  }
  return deliveryDate.slice(0, 7)
}

function isOverdueIncomplete(
  status: string,
  deliveryDate: string,
  todayLocalDate: string,
): boolean {
  if (status === 'COMPLETED' || status === 'CANCELLED') {
    return false
  }
  return deliveryDate < todayLocalDate
}

function isCancelled(status: string): boolean {
  return status === 'CANCELLED'
}

function hasDeliveryProof(stop: AnalyticsStopInput): boolean {
  return stop.deliveryProof != null && typeof stop.deliveryProof === 'object'
}

function proofMethodOf(stop: AnalyticsStopInput): string | null {
  const method = stop.deliveryProof?.method
  if (typeof method !== 'string' || method.length === 0) {
    return null
  }
  return method
}

function isValidProofMethod(method: string | null): method is 'QR' | 'ADMIN' {
  return method === 'QR' || method === 'ADMIN'
}

function orderCountOf(stop: AnalyticsStopInput): number {
  if (
    Array.isArray(stop.deliveryProof?.associatedOrderIds) &&
    stop.deliveryProof.associatedOrderIds.length > 0
  ) {
    return stop.deliveryProof.associatedOrderIds.length
  }
  if (typeof stop.orderCount === 'number' && Number.isFinite(stop.orderCount)) {
    return Math.max(0, stop.orderCount)
  }
  if (Array.isArray(stop.orderIds)) {
    return stop.orderIds.length
  }
  return 0
}

function quantityOf(stop: AnalyticsStopInput): number {
  if (typeof stop.totalQuantity === 'number' && Number.isFinite(stop.totalQuantity)) {
    return Math.max(0, stop.totalQuantity)
  }
  return 0
}

function stopKey(routeId: string, stop: AnalyticsStopInput, index: number): string {
  if (typeof stop.stopId === 'string' && stop.stopId.length > 0) {
    return `${routeId}:${stop.stopId}`
  }
  return `${routeId}:seq:${stop.sequence ?? index}`
}

function recordIssue(
  acc: MutableCourierAcc,
  key: string,
  type: keyof CourierConsistencyIssueBreakdown,
): void {
  if (acc.issueKeys.has(key)) {
    return
  }
  acc.issueKeys.add(key)
  acc.consistencyBreakdown[type] += 1
}

function ensureCourier(
  map: Map<string, MutableCourierAcc>,
  identity: AnalyticsCourierIdentity,
): MutableCourierAcc {
  const existing = map.get(identity.courierProfileId)
  if (existing) {
    return existing
  }
  const created: MutableCourierAcc = {
    identity,
    totalAssignedRoutes: 0,
    completedRoutes: 0,
    incompleteRoutes: 0,
    cancelledRoutes: 0,
    activeRoutes: 0,
    deliveredStops: 0,
    undeliveredOverdueStops: 0,
    totalOrdersDelivered: 0,
    totalVaccineQuantityDelivered: 0,
    deliveredStopsWithValidTimestamp: 0,
    onTimeDeliveredStops: 0,
    lateDeliveredStops: 0,
    deliveredStopsWithValidProofMethod: 0,
    qrConfirmedStops: 0,
    handlingDurationsSeconds: [],
    consistencyBreakdown: emptyBreakdown(),
    issueKeys: new Set(),
  }
  map.set(identity.courierProfileId, created)
  return created
}

function getOrCreateMonthly(
  global: GlobalAcc,
  deliveryDate: string,
): MonthlyActivityBucket | null {
  const month = monthKeyFromDeliveryDate(deliveryDate)
  if (!month) {
    return null
  }
  let bucket = global.monthly.get(month)
  if (!bucket) {
    bucket = emptyMonthly(month)
    global.monthly.set(month, bucket)
  }
  return bucket
}

function inspectLegacyRoute(
  route: AnalyticsRouteInput,
  global: GlobalAcc,
): void {
  if (
    !route.bezorgerProfileId ||
    !route.deliveryDate ||
    !/^\d{4}-\d{2}-\d{2}$/.test(route.deliveryDate)
  ) {
    global.dataQuality.legacyRoutesWithoutRequiredFields += 1
  }
  if (!Array.isArray(route.stops)) {
    global.dataQuality.legacyRoutesWithoutRequiredFields += 1
    return
  }

  const sequences = new Set<number>()
  for (const [index, stop] of route.stops.entries()) {
    const seq = stop.sequence
    if (typeof seq !== 'number' || !Number.isFinite(seq) || sequences.has(seq)) {
      global.dataQuality.invalidStopSequences += 1
    } else {
      sequences.add(seq)
    }

    const orderIds = stop.orderIds
    const orderCount = stop.orderCount
    if (
      (Array.isArray(orderIds) && orderIds.length === 0) ||
      orderCount === 0 ||
      (orderCount == null && (!Array.isArray(orderIds) || orderIds.length === 0))
    ) {
      // Empty stops can be legitimate after regeneration edge cases; count only
      // when orderCount claims orders but ids are missing.
      if (
        typeof orderCount === 'number' &&
        orderCount > 0 &&
        (!Array.isArray(orderIds) || orderIds.length === 0)
      ) {
        global.dataQuality.missingOrders += 1
      }
    }

    void index
  }
}

function classifyTimeliness(
  deliveredAt: Date,
  routeDeliveryDate: string,
  timeZone: string,
): 'ON_TIME' | 'LATE' {
  const localDate = getLocalCalendarDate(deliveredAt, timeZone)
  return localDate === routeDeliveryDate ? 'ON_TIME' : 'LATE'
}

function handlingDurationSeconds(
  stop: AnalyticsStopInput,
): number | null {
  const arrived = toValidDate(stop.arrival?.recordedAt)
  const delivered = toValidDate(stop.deliveryProof?.deliveredAt)
  if (!arrived || !delivered) {
    return null
  }
  const seconds = (delivered.getTime() - arrived.getTime()) / 1000
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null
  }
  // Guard absurd values (> 7 days)
  if (seconds > 7 * 24 * 60 * 60) {
    return null
  }
  return seconds
}

function isProofMalformed(stop: AnalyticsStopInput): boolean {
  if (!hasDeliveryProof(stop)) {
    return false
  }
  const method = proofMethodOf(stop)
  const deliveredAt = toValidDate(stop.deliveryProof?.deliveredAt)
  if (!method || !deliveredAt) {
    return true
  }
  return false
}

/**
 * Pure courier-performance calculation. No I/O.
 */
export function calculateCourierPerformanceAnalytics(
  input: CalculateCourierPerformanceInput,
): CourierPerformanceAnalyticsResult {
  const {
    routes,
    couriers,
    zeroRouteBezorgerProfileCount,
    todayLocalDate,
    timeZone,
    generatedAt,
  } = input

  const identityByProfileId = new Map(
    couriers.map((courier) => [courier.courierProfileId, courier]),
  )
  const courierMap = new Map<string, MutableCourierAcc>()
  const global = createGlobalAcc()

  for (const route of routes) {
    inspectLegacyRoute(route, global)

    const profileId = String(route.bezorgerProfileId ?? '')
    if (!profileId) {
      continue
    }

    let identity = identityByProfileId.get(profileId)
    if (!identity) {
      identity = {
        courierProfileId: profileId,
        courierUserId: '',
        displayName: `Courier ${profileId}`,
        vehicleLabel: null,
      }
    }

    const acc = ensureCourier(courierMap, identity)
    const status = String(route.status ?? '')
    const deliveryDate = String(route.deliveryDate ?? '')
    const cancelled = isCancelled(status)
    const overdueIncomplete = isOverdueIncomplete(
      status,
      deliveryDate,
      todayLocalDate,
    )
    const monthly = getOrCreateMonthly(global, deliveryDate)

    acc.totalAssignedRoutes += 1
    global.overallAssignedRoutes += 1
    if (monthly) {
      monthly.assignedRoutes += 1
    }

    if (status === 'COMPLETED') {
      acc.completedRoutes += 1
      global.overallCompletedRoutes += 1
      if (monthly) {
        monthly.completedRoutes += 1
      }
      global.routeStatus.COMPLETED += 1
    } else if (status === 'CANCELLED') {
      acc.cancelledRoutes += 1
      global.overallCancelledRoutes += 1
      global.routeStatus.CANCELLED += 1
    } else if (overdueIncomplete) {
      // Derived bucket — mutually exclusive with ASSIGNED/IN_PROGRESS in distribution.
      acc.activeRoutes += 1
      acc.incompleteRoutes += 1
      global.overallIncompleteRoutes += 1
      global.routeStatus.OVERDUE_INCOMPLETE += 1
      recordIssue(
        acc,
        `route-overdue:${route.id}`,
        'overdueIncompleteRoutes',
      )
    } else if (status === 'ASSIGNED') {
      acc.activeRoutes += 1
      global.routeStatus.ASSIGNED += 1
    } else if (status === 'IN_PROGRESS') {
      acc.activeRoutes += 1
      global.routeStatus.IN_PROGRESS += 1
    }

    const stops = Array.isArray(route.stops) ? route.stops : []

    for (const [index, stop] of stops.entries()) {
      const delivered = hasDeliveryProof(stop)
      const key = stopKey(route.id, stop, index)

      if (delivered && isProofMalformed(stop)) {
        global.dataQuality.malformedProofs += 1
        recordIssue(acc, `proof-invalid:${key}`, 'invalidOrIncompleteProofs')
      }

      if (delivered) {
        // Delivered stops count regardless of route cancellation for volume
        // totals, but cancelled routes are excluded from rate denominators.
        if (!cancelled) {
          acc.deliveredStops += 1
          global.overallDeliveredStops += 1

          const orders = orderCountOf(stop)
          const qty = quantityOf(stop)
          acc.totalOrdersDelivered += orders
          acc.totalVaccineQuantityDelivered += qty
          global.overallDeliveredOrders += orders
          global.overallDeliveredQty += qty

          if (monthly) {
            monthly.deliveredStops += 1
            monthly.deliveredOrders += orders
            monthly.deliveredVaccineQuantity += qty
          }

          const deliveredAt = toValidDate(stop.deliveryProof?.deliveredAt)
          if (!deliveredAt) {
            global.dataQuality.deliveredStopsWithoutTimestamp += 1
            global.timeliness.UNKNOWN += 1
          } else {
            acc.deliveredStopsWithValidTimestamp += 1
            global.overallWithTimestamp += 1
            const bucket = classifyTimeliness(
              deliveredAt,
              deliveryDate,
              timeZone,
            )
            if (bucket === 'ON_TIME') {
              acc.onTimeDeliveredStops += 1
              global.overallOnTime += 1
              global.timeliness.ON_TIME += 1
              if (monthly) {
                monthly.onTimeStops += 1
              }
            } else {
              acc.lateDeliveredStops += 1
              global.overallLate += 1
              global.timeliness.LATE += 1
              if (monthly) {
                monthly.lateStops += 1
              }
            }
          }

          const method = proofMethodOf(stop)
          if (isValidProofMethod(method)) {
            acc.deliveredStopsWithValidProofMethod += 1
            global.overallValidProofMethod += 1
            if (method === 'QR') {
              acc.qrConfirmedStops += 1
              global.overallQr += 1
              global.proof.QR += 1
            } else {
              global.proof.ADMIN += 1
            }
          } else {
            global.proof.UNKNOWN += 1
          }

          const duration = handlingDurationSeconds(stop)
          if (duration == null) {
            if (
              stop.arrival?.recordedAt != null ||
              stop.deliveryProof?.deliveredAt != null
            ) {
              const arrived = toValidDate(stop.arrival?.recordedAt)
              const deliveredAt2 = toValidDate(stop.deliveryProof?.deliveredAt)
              if (arrived && deliveredAt2) {
                global.dataQuality.invalidHandlingDurations += 1
              }
            }
          } else {
            acc.handlingDurationsSeconds.push(duration)
          }
        }
      } else if (!cancelled && overdueIncomplete) {
        acc.undeliveredOverdueStops += 1
        global.overallUndeliveredOverdueStops += 1

        if (stop.confirmationProcess?.state === 'PROCESSING') {
          recordIssue(
            acc,
            `processing:${key}`,
            'abandonedProcessingConfirmations',
          )
        }
      }
    }
  }

  const rankingsUnsorted: CourierRankingRow[] = []

  for (const acc of courierMap.values()) {
    const routeCompletionRate = rateOrNull(
      acc.completedRoutes,
      acc.completedRoutes + acc.incompleteRoutes,
    )
    const deliveryCompletionRate = rateOrNull(
      acc.deliveredStops,
      acc.deliveredStops + acc.undeliveredOverdueStops,
    )
    const onTimeDeliveryRate = rateOrNull(
      acc.onTimeDeliveredStops,
      acc.deliveredStopsWithValidTimestamp,
    )
    const qrConfirmationRate = rateOrNull(
      acc.qrConfirmedStops,
      acc.deliveredStopsWithValidProofMethod,
    )

    const consistencyEligibleUnits =
      acc.deliveredStops + acc.undeliveredOverdueStops
    const consistencyIssueCount =
      acc.consistencyBreakdown.overdueIncompleteRoutes +
      acc.consistencyBreakdown.abandonedProcessingConfirmations +
      acc.consistencyBreakdown.invalidOrIncompleteProofs

    const consistencyScore =
      consistencyEligibleUnits <= 0
        ? null
        : clampScore(
            100 *
              (1 -
                consistencyIssueCount / Math.max(1, consistencyEligibleUnits)),
          )

    const componentScores: CourierComponentScores = {
      routeCompletion: scoreFromRate(routeCompletionRate),
      deliveryCompletion: scoreFromRate(deliveryCompletionRate),
      onTime: scoreFromRate(onTimeDeliveryRate),
      qrConfirmation: scoreFromRate(qrConfirmationRate),
      operationalConsistency:
        consistencyScore == null ? 0 : clampScore(consistencyScore),
    }

    const weightedContributions: CourierWeightedContributions = {
      routeCompletion:
        componentScores.routeCompletion * WEIGHTS.routeCompletion,
      deliveryCompletion:
        componentScores.deliveryCompletion * WEIGHTS.deliveryCompletion,
      onTime: componentScores.onTime * WEIGHTS.onTime,
      qrConfirmation: componentScores.qrConfirmation * WEIGHTS.qrConfirmation,
      operationalConsistency:
        componentScores.operationalConsistency *
        WEIGHTS.operationalConsistency,
    }

    const totalScoreRaw =
      weightedContributions.routeCompletion +
      weightedContributions.deliveryCompletion +
      weightedContributions.onTime +
      weightedContributions.qrConfirmation +
      weightedContributions.operationalConsistency

    const hasEligibleDenominator =
      routeCompletionRate != null ||
      deliveryCompletionRate != null ||
      onTimeDeliveryRate != null ||
      qrConfirmationRate != null ||
      consistencyScore != null

    const dataCompleteness = hasEligibleDenominator
      ? CourierAnalyticsDataCompleteness.ELIGIBLE
      : CourierAnalyticsDataCompleteness.INSUFFICIENT

    const rawMetrics: CourierRawMetrics = {
      totalAssignedRoutes: acc.totalAssignedRoutes,
      completedRoutes: acc.completedRoutes,
      incompleteRoutes: acc.incompleteRoutes,
      cancelledRoutes: acc.cancelledRoutes,
      activeRoutes: acc.activeRoutes,
      routeCompletionRate,
      totalEligibleStops: acc.deliveredStops + acc.undeliveredOverdueStops,
      deliveredStops: acc.deliveredStops,
      undeliveredOverdueStops: acc.undeliveredOverdueStops,
      deliveryCompletionRate,
      totalOrdersDelivered: acc.totalOrdersDelivered,
      totalVaccineQuantityDelivered: acc.totalVaccineQuantityDelivered,
      deliveredStopsWithValidTimestamp: acc.deliveredStopsWithValidTimestamp,
      onTimeDeliveredStops: acc.onTimeDeliveredStops,
      lateDeliveredStops: acc.lateDeliveredStops,
      onTimeDeliveryRate,
      deliveredStopsWithValidProofMethod:
        acc.deliveredStopsWithValidProofMethod,
      qrConfirmedStops: acc.qrConfirmedStops,
      qrConfirmationRate,
      consistencyIssueCount,
      consistencyEligibleUnits,
      consistencyScore,
      averageHandlingDurationSeconds: average(acc.handlingDurationsSeconds),
      medianHandlingDurationSeconds: median(acc.handlingDurationsSeconds),
      handlingDurationSampleCount: acc.handlingDurationsSeconds.length,
    }

    rankingsUnsorted.push({
      courierProfileId: acc.identity.courierProfileId,
      courierUserId: acc.identity.courierUserId,
      displayName: acc.identity.displayName,
      vehicleLabel: acc.identity.vehicleLabel ?? null,
      rank: 0,
      totalScore: roundScore(clampScore(totalScoreRaw)),
      dataCompleteness,
      componentScores: {
        routeCompletion: roundScore(componentScores.routeCompletion),
        deliveryCompletion: roundScore(componentScores.deliveryCompletion),
        onTime: roundScore(componentScores.onTime),
        qrConfirmation: roundScore(componentScores.qrConfirmation),
        operationalConsistency: roundScore(
          componentScores.operationalConsistency,
        ),
      },
      weightedContributions: {
        routeCompletion: roundScore(weightedContributions.routeCompletion),
        deliveryCompletion: roundScore(
          weightedContributions.deliveryCompletion,
        ),
        onTime: roundScore(weightedContributions.onTime),
        qrConfirmation: roundScore(weightedContributions.qrConfirmation),
        operationalConsistency: roundScore(
          weightedContributions.operationalConsistency,
        ),
      },
      rawMetrics,
      consistencyIssueBreakdown: { ...acc.consistencyBreakdown },
    })
  }

  rankingsUnsorted.sort(compareCourierRankings)

  const courierRankings = rankingsUnsorted.map((row, index) => ({
    ...row,
    rank: index + 1,
  }))

  const eligibleScores = courierRankings
    .filter(
      (row) =>
        row.dataCompleteness === CourierAnalyticsDataCompleteness.ELIGIBLE,
    )
    .map((row) => row.totalScore)

  const summary = {
    courierCount: courierRankings.length,
    couriersWithEligibleData: eligibleScores.length,
    currentBezorgerProfilesWithZeroRoutes: zeroRouteBezorgerProfileCount,
    totalAssignedRoutes: global.overallAssignedRoutes,
    totalCompletedRoutes: global.overallCompletedRoutes,
    totalCancelledRoutes: global.overallCancelledRoutes,
    totalDeliveredStops: global.overallDeliveredStops,
    totalDeliveredOrders: global.overallDeliveredOrders,
    totalDeliveredVaccineQuantity: global.overallDeliveredQty,
    overallRouteCompletionRate: rateOrNull(
      global.overallCompletedRoutes,
      global.overallCompletedRoutes + global.overallIncompleteRoutes,
    ),
    overallDeliveryCompletionRate: rateOrNull(
      global.overallDeliveredStops,
      global.overallDeliveredStops + global.overallUndeliveredOverdueStops,
    ),
    overallOnTimeRate: rateOrNull(
      global.overallOnTime,
      global.overallWithTimestamp,
    ),
    overallQrConfirmationRate: rateOrNull(
      global.overallQr,
      global.overallValidProofMethod,
    ),
    averageReliabilityScore: (() => {
      const value = average(eligibleScores)
      return value == null ? null : roundScore(value)
    })(),
    medianReliabilityScore: (() => {
      const value = median(eligibleScores)
      return value == null ? null : roundScore(value)
    })(),
    highestReliabilityScore:
      eligibleScores.length > 0 ? roundScore(Math.max(...eligibleScores)) : null,
    topCourier:
      courierRankings.length > 0 &&
      courierRankings[0].dataCompleteness ===
        CourierAnalyticsDataCompleteness.ELIGIBLE
        ? {
            courierProfileId: courierRankings[0].courierProfileId,
            displayName: courierRankings[0].displayName,
            totalScore: courierRankings[0].totalScore,
          }
        : null,
  }

  const monthlyActivity = [...global.monthly.values()].sort((a, b) =>
    a.month.localeCompare(b.month),
  )

  return {
    generatedAt,
    summary,
    courierRankings,
    monthlyActivity,
    routeStatusDistribution: toNamedCounts(
      global.routeStatus,
      ROUTE_STATUS_DISTRIBUTION_KEYS,
    ),
    deliveryTimelinessDistribution: toNamedCounts(
      global.timeliness,
      DELIVERY_TIMELINESS_DISTRIBUTION_KEYS,
    ),
    deliveryProofDistribution: toNamedCounts(
      global.proof,
      DELIVERY_PROOF_DISTRIBUTION_KEYS,
    ),
    dataQuality: global.dataQuality,
  }
}

export function compareCourierRankings(
  a: CourierRankingRow,
  b: CourierRankingRow,
): number {
  const aEligible =
    a.dataCompleteness === CourierAnalyticsDataCompleteness.ELIGIBLE ? 0 : 1
  const bEligible =
    b.dataCompleteness === CourierAnalyticsDataCompleteness.ELIGIBLE ? 0 : 1
  if (aEligible !== bEligible) {
    return aEligible - bEligible
  }
  if (b.totalScore !== a.totalScore) {
    return b.totalScore - a.totalScore
  }
  if (b.rawMetrics.deliveredStops !== a.rawMetrics.deliveredStops) {
    return b.rawMetrics.deliveredStops - a.rawMetrics.deliveredStops
  }
  if (b.rawMetrics.completedRoutes !== a.rawMetrics.completedRoutes) {
    return b.rawMetrics.completedRoutes - a.rawMetrics.completedRoutes
  }
  const nameCmp = a.displayName.localeCompare(b.displayName, 'en')
  if (nameCmp !== 0) {
    return nameCmp
  }
  return a.courierProfileId.localeCompare(b.courierProfileId, 'en')
}

function toNamedCounts(
  counts: Record<string, number>,
  keys: readonly string[],
): NamedCountBucket[] {
  return keys.map((key) => ({
    key,
    count: counts[key] ?? 0,
  }))
}

/** Exported for unit tests — verifies weight sum. */
export function sumReliabilityWeights(): number {
  return (
    WEIGHTS.routeCompletion +
    WEIGHTS.deliveryCompletion +
    WEIGHTS.onTime +
    WEIGHTS.qrConfirmation +
    WEIGHTS.operationalConsistency
  )
}

export { CONSISTENCY_ISSUE_TYPES }
