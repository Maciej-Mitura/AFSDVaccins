/**
 * Phase 32A — central courier-performance metric definitions.
 *
 * All formulas live here (and in the pure calculator). Resolvers/controllers
 * must not re-derive rates or scores.
 *
 * Scope: ADMIN-only, all-time historical generated DeliveryRoute data.
 * Timezone: Europe/Brussels (or application settings timezone) calendar dates.
 */

/** Reliability score weights — must sum to 1.0. */
export const COURIER_RELIABILITY_WEIGHTS = {
  routeCompletion: 0.35,
  deliveryCompletion: 0.25,
  onTime: 0.2,
  qrConfirmation: 0.1,
  operationalConsistency: 0.1,
} as const

export type CourierReliabilityWeightKey = keyof typeof COURIER_RELIABILITY_WEIGHTS

/**
 * On-time interpretation (Phase 32A):
 * A delivered stop is on time iff deliveryProof.deliveredAt falls on the same
 * Europe/Brussels calendar date as route.deliveryDate (YYYY-MM-DD equality).
 * Earlier or later calendar dates are LATE for distribution and are not on time.
 * Missing/invalid deliveredAt → UNKNOWN (excluded from on-time denominator).
 */
export const ON_TIME_RULE = 'SAME_BRUSSELS_CALENDAR_DATE' as const

/**
 * No-data policy:
 * - Rate metrics return `null` when the eligible denominator is 0.
 * - Reliability component scores use 0 when the corresponding rate is null
 *   (insufficient data — never invent 100).
 * - Couriers with no eligible scoring denominators rank after couriers with
 *   meaningful data; `dataCompleteness` is exposed explicitly.
 */
export const NO_DATA_POLICY = {
  rateWhenNoDenominator: null,
  componentScoreWhenNoDenominator: 0,
  rankInsufficientAfterEligible: true,
} as const

/** Data-completeness labels for ranking / UI explanation. */
export enum CourierAnalyticsDataCompleteness {
  /** At least one core rate denominator is eligible. */
  ELIGIBLE = 'ELIGIBLE',
  /** Assigned routes exist but no eligible scoring denominators. */
  INSUFFICIENT = 'INSUFFICIENT',
}

/**
 * Route metric definitions (per courier, all-time).
 *
 * totalAssignedRoutes — generated routes with bezorgerProfileId = courier
 * completedRoutes — status COMPLETED
 * cancelledRoutes — status CANCELLED
 * activeRoutes — status ASSIGNED or IN_PROGRESS (not yet overdue check)
 * incompleteRoutes — deliveryDate < today (Brussels) AND status ∉ {COMPLETED, CANCELLED}
 * routeCompletionRate — completedRoutes / (completedRoutes + incompleteRoutes)
 *   Excludes CANCELLED and future/active non-overdue routes from the denominator.
 */
export const ROUTE_METRIC_DEFINITIONS = {
  totalAssignedRoutes:
    'Generated DeliveryRoute rows historically assigned to the courier.',
  completedRoutes: 'Routes with status COMPLETED.',
  cancelledRoutes: 'Routes with status CANCELLED (ADMIN terminal).',
  activeRoutes: 'Routes with status ASSIGNED or IN_PROGRESS.',
  incompleteRoutes:
    'Routes whose deliveryDate is before today (app timezone) and status is neither COMPLETED nor CANCELLED.',
  routeCompletionRate:
    'completedRoutes / (completedRoutes + incompleteRoutes); null when denominator is 0.',
} as const

/**
 * Delivery metrics use generated route stops as the delivery unit.
 *
 * totalEligibleStops — stops on non-cancelled routes that are delivered or overdue-undelivered
 * deliveredStops — stops with a deliveryProof object present
 * undeliveredOverdueStops — stops on overdue non-cancelled routes without deliveryProof
 * deliveryCompletionRate — deliveredStops / (deliveredStops + undeliveredOverdueStops)
 * totalOrdersDelivered — sum of orderCount (or associatedOrderIds length) on delivered stops
 * totalVaccineQuantityDelivered — sum of totalQuantity on delivered stops
 *
 * One stop with multiple orders counts as one stop delivery.
 * Cancelled routes, future routes, and not-yet-overdue active routes are excluded
 * from the delivery-completion denominator.
 */
export const DELIVERY_METRIC_DEFINITIONS = {
  unit: 'generated DeliveryStop',
  deliveryCompletionRate:
    'deliveredStops / (deliveredStops + undeliveredOverdueStops); null when denominator is 0.',
} as const

/**
 * QR confirmation rate:
 * qrConfirmedStops where deliveryProof.method === 'QR'
 * Denominator: deliveredStops with a recognised proof method (QR | ADMIN).
 * Legacy delivered stops without a valid method are excluded from the rate
 * but counted in data-quality diagnostics / UNKNOWN proof distribution.
 * Do not infer QR from order.deliveryMethod alone.
 */
export const QR_METRIC_DEFINITIONS = {
  qrConfirmationRate:
    'qrConfirmedStops / deliveredStopsWithValidProofMethod; null when denominator is 0.',
} as const

/**
 * Operational consistency (0–100):
 *
 * consistencyScore = 100 × (1 − attributableIssueCount / max(1, eligibleOperationalUnits))
 * Clamped to [0, 100]. Null/0 component when eligibleOperationalUnits is 0 and no issues.
 *
 * eligibleOperationalUnits = deliveredStops + undeliveredOverdueStops
 *   (same population as delivery completion; stable stop-level units)
 *
 * attributableIssueCount — distinct incidents, never double-counted:
 * - overdue incomplete route (one per route)
 * - abandoned PROCESSING confirmation on an overdue undelivered stop (one per stop)
 * - invalid/incomplete deliveryProof on a stop that looks delivered (one per stop)
 *
 * Not attributable (never penalised):
 * - ADMIN-cancelled routes
 * - cancelled orders
 * - push / Azure / offline / reassignment technical events
 */
export const CONSISTENCY_ISSUE_TYPES = {
  OVERDUE_INCOMPLETE_ROUTE: 'OVERDUE_INCOMPLETE_ROUTE',
  ABANDONED_PROCESSING_CONFIRMATION: 'ABANDONED_PROCESSING_CONFIRMATION',
  INVALID_OR_INCOMPLETE_PROOF: 'INVALID_OR_INCOMPLETE_PROOF',
} as const

export type ConsistencyIssueType =
  (typeof CONSISTENCY_ISSUE_TYPES)[keyof typeof CONSISTENCY_ISSUE_TYPES]

/**
 * Ranking (stable, deterministic):
 * 1. totalScore descending
 * 2. deliveredStops descending
 * 3. completedRoutes descending
 * 4. displayName ascending (localeCompare)
 * 5. courierProfileId ascending
 *
 * Couriers with dataCompleteness INSUFFICIENT sort after ELIGIBLE, then by the
 * same tie-breakers.
 */
export const RANKING_RULES = [
  'eligibleBeforeInsufficient',
  'totalScoreDesc',
  'deliveredStopsDesc',
  'completedRoutesDesc',
  'displayNameAsc',
  'courierProfileIdAsc',
] as const

/**
 * Monthly activity gap policy: only months with at least one counted activity
 * are returned (no zero-filled gaps). Months use Europe/Brussels YYYY-MM from
 * route.deliveryDate for route counts; delivered stop/order/quantity buckets
 * use route.deliveryDate as well so business-day semantics stay consistent.
 */
export const MONTHLY_GAP_POLICY = 'ACTIVITY_MONTHS_ONLY' as const

/** Distribution keys returned chart-ready from the API. */
export const ROUTE_STATUS_DISTRIBUTION_KEYS = [
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'OVERDUE_INCOMPLETE',
] as const

export const DELIVERY_TIMELINESS_DISTRIBUTION_KEYS = [
  'ON_TIME',
  'LATE',
  'UNKNOWN',
] as const

export const DELIVERY_PROOF_DISTRIBUTION_KEYS = [
  'QR',
  'ADMIN',
  'UNKNOWN',
] as const
