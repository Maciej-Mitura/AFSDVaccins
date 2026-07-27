import type {
  ConsistencyIssueType,
  CourierAnalyticsDataCompleteness,
} from './courier-analytics.definitions'

/** Minimal route shape consumed by the pure calculator (decoupled from TypeORM). */
export type AnalyticsRouteInput = {
  id: string
  bezorgerProfileId: string
  deliveryDate: string
  status: string
  generatedAt?: Date | string | null
  stops: AnalyticsStopInput[]
}

export type AnalyticsStopInput = {
  stopId?: string | null
  sequence?: number | null
  orderIds?: string[] | null
  orderCount?: number | null
  totalQuantity?: number | null
  arrival?: {
    recordedAt?: Date | string | null
  } | null
  deliveryProof?: {
    method?: string | null
    deliveredAt?: Date | string | null
    associatedOrderIds?: string[] | null
  } | null
  confirmationProcess?: {
    state?: string | null
  } | null
}

export type AnalyticsCourierIdentity = {
  courierProfileId: string
  courierUserId: string
  displayName: string
  vehicleLabel?: string | null
}

export type CourierConsistencyIssueBreakdown = {
  overdueIncompleteRoutes: number
  abandonedProcessingConfirmations: number
  invalidOrIncompleteProofs: number
}

export type CourierRawMetrics = {
  totalAssignedRoutes: number
  completedRoutes: number
  incompleteRoutes: number
  cancelledRoutes: number
  activeRoutes: number
  routeCompletionRate: number | null
  totalEligibleStops: number
  deliveredStops: number
  undeliveredOverdueStops: number
  deliveryCompletionRate: number | null
  totalOrdersDelivered: number
  totalVaccineQuantityDelivered: number
  deliveredStopsWithValidTimestamp: number
  onTimeDeliveredStops: number
  lateDeliveredStops: number
  onTimeDeliveryRate: number | null
  deliveredStopsWithValidProofMethod: number
  qrConfirmedStops: number
  qrConfirmationRate: number | null
  consistencyIssueCount: number
  consistencyEligibleUnits: number
  consistencyScore: number | null
  averageHandlingDurationSeconds: number | null
  medianHandlingDurationSeconds: number | null
  handlingDurationSampleCount: number
}

export type CourierComponentScores = {
  routeCompletion: number
  deliveryCompletion: number
  onTime: number
  qrConfirmation: number
  operationalConsistency: number
}

export type CourierWeightedContributions = CourierComponentScores

export type CourierRankingRow = {
  courierProfileId: string
  courierUserId: string
  displayName: string
  vehicleLabel: string | null
  rank: number
  totalScore: number
  dataCompleteness: CourierAnalyticsDataCompleteness
  componentScores: CourierComponentScores
  weightedContributions: CourierWeightedContributions
  rawMetrics: CourierRawMetrics
  consistencyIssueBreakdown: CourierConsistencyIssueBreakdown
}

export type CourierAnalyticsSummary = {
  courierCount: number
  couriersWithEligibleData: number
  currentBezorgerProfilesWithZeroRoutes: number
  totalAssignedRoutes: number
  totalCompletedRoutes: number
  totalCancelledRoutes: number
  totalDeliveredStops: number
  totalDeliveredOrders: number
  totalDeliveredVaccineQuantity: number
  overallRouteCompletionRate: number | null
  overallDeliveryCompletionRate: number | null
  overallOnTimeRate: number | null
  overallQrConfirmationRate: number | null
  averageReliabilityScore: number | null
  medianReliabilityScore: number | null
  highestReliabilityScore: number | null
  topCourier: {
    courierProfileId: string
    displayName: string
    totalScore: number
  } | null
}

export type MonthlyActivityBucket = {
  month: string
  assignedRoutes: number
  completedRoutes: number
  deliveredStops: number
  deliveredOrders: number
  deliveredVaccineQuantity: number
  onTimeStops: number
  lateStops: number
}

export type NamedCountBucket = {
  key: string
  count: number
}

export type CourierAnalyticsDataQuality = {
  legacyRoutesWithoutRequiredFields: number
  deliveredStopsWithoutTimestamp: number
  invalidStopSequences: number
  missingOrders: number
  invalidHandlingDurations: number
  malformedProofs: number
}

export type CourierPerformanceAnalyticsResult = {
  generatedAt: Date
  summary: CourierAnalyticsSummary
  courierRankings: CourierRankingRow[]
  monthlyActivity: MonthlyActivityBucket[]
  routeStatusDistribution: NamedCountBucket[]
  deliveryTimelinessDistribution: NamedCountBucket[]
  deliveryProofDistribution: NamedCountBucket[]
  dataQuality: CourierAnalyticsDataQuality
}

export type ConsistencyIssueRef = {
  type: ConsistencyIssueType
  routeId: string
  stopId?: string | null
}
