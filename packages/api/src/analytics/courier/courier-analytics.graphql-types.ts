import { Field, Float, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql'

import { CourierAnalyticsDataCompleteness } from './courier-analytics.definitions'

registerEnumType(CourierAnalyticsDataCompleteness, {
  name: 'CourierAnalyticsDataCompleteness',
  description:
    'Whether the courier has enough eligible historical data for reliability scoring',
})

@ObjectType()
export class CourierAnalyticsComponentScores {
  @Field(() => Float)
  routeCompletion!: number

  @Field(() => Float)
  deliveryCompletion!: number

  @Field(() => Float)
  onTime!: number

  @Field(() => Float)
  qrConfirmation!: number

  @Field(() => Float)
  operationalConsistency!: number
}

@ObjectType()
export class CourierAnalyticsConsistencyIssueBreakdown {
  @Field(() => Int)
  overdueIncompleteRoutes!: number

  @Field(() => Int)
  abandonedProcessingConfirmations!: number

  @Field(() => Int)
  invalidOrIncompleteProofs!: number
}

@ObjectType()
export class CourierAnalyticsRawMetrics {
  @Field(() => Int)
  totalAssignedRoutes!: number

  @Field(() => Int)
  completedRoutes!: number

  @Field(() => Int)
  incompleteRoutes!: number

  @Field(() => Int)
  cancelledRoutes!: number

  @Field(() => Int)
  activeRoutes!: number

  @Field(() => Float, { nullable: true })
  routeCompletionRate!: number | null

  @Field(() => Int)
  totalEligibleStops!: number

  @Field(() => Int)
  deliveredStops!: number

  @Field(() => Int)
  undeliveredOverdueStops!: number

  @Field(() => Float, { nullable: true })
  deliveryCompletionRate!: number | null

  @Field(() => Int)
  totalOrdersDelivered!: number

  @Field(() => Int)
  totalVaccineQuantityDelivered!: number

  @Field(() => Int)
  deliveredStopsWithValidTimestamp!: number

  @Field(() => Int)
  onTimeDeliveredStops!: number

  @Field(() => Int)
  lateDeliveredStops!: number

  @Field(() => Float, { nullable: true })
  onTimeDeliveryRate!: number | null

  @Field(() => Int)
  deliveredStopsWithValidProofMethod!: number

  @Field(() => Int)
  qrConfirmedStops!: number

  @Field(() => Float, { nullable: true })
  qrConfirmationRate!: number | null

  @Field(() => Int)
  consistencyIssueCount!: number

  @Field(() => Int)
  consistencyEligibleUnits!: number

  @Field(() => Float, { nullable: true })
  consistencyScore!: number | null

  @Field(() => Float, { nullable: true })
  averageHandlingDurationSeconds!: number | null

  @Field(() => Float, { nullable: true })
  medianHandlingDurationSeconds!: number | null

  @Field(() => Int)
  handlingDurationSampleCount!: number
}

@ObjectType()
export class CourierAnalyticsRanking {
  @Field(() => ID)
  courierProfileId!: string

  @Field(() => ID)
  courierUserId!: string

  @Field()
  displayName!: string

  @Field(() => String, { nullable: true })
  vehicleLabel!: string | null

  @Field(() => Int)
  rank!: number

  @Field(() => Float)
  totalScore!: number

  @Field(() => CourierAnalyticsDataCompleteness)
  dataCompleteness!: CourierAnalyticsDataCompleteness

  @Field(() => CourierAnalyticsComponentScores)
  componentScores!: CourierAnalyticsComponentScores

  @Field(() => CourierAnalyticsComponentScores)
  weightedContributions!: CourierAnalyticsComponentScores

  @Field(() => CourierAnalyticsRawMetrics)
  rawMetrics!: CourierAnalyticsRawMetrics

  @Field(() => CourierAnalyticsConsistencyIssueBreakdown)
  consistencyIssueBreakdown!: CourierAnalyticsConsistencyIssueBreakdown
}

@ObjectType()
export class CourierAnalyticsTopCourier {
  @Field(() => ID)
  courierProfileId!: string

  @Field()
  displayName!: string

  @Field(() => Float)
  totalScore!: number
}

@ObjectType()
export class CourierAnalyticsSummary {
  @Field(() => Int)
  courierCount!: number

  @Field(() => Int)
  couriersWithEligibleData!: number

  @Field(() => Int)
  currentBezorgerProfilesWithZeroRoutes!: number

  @Field(() => Int)
  totalAssignedRoutes!: number

  @Field(() => Int)
  totalCompletedRoutes!: number

  @Field(() => Int)
  totalCancelledRoutes!: number

  @Field(() => Int)
  totalDeliveredStops!: number

  @Field(() => Int)
  totalDeliveredOrders!: number

  @Field(() => Int)
  totalDeliveredVaccineQuantity!: number

  @Field(() => Float, { nullable: true })
  overallRouteCompletionRate!: number | null

  @Field(() => Float, { nullable: true })
  overallDeliveryCompletionRate!: number | null

  @Field(() => Float, { nullable: true })
  overallOnTimeRate!: number | null

  @Field(() => Float, { nullable: true })
  overallQrConfirmationRate!: number | null

  @Field(() => Float, { nullable: true })
  averageReliabilityScore!: number | null

  @Field(() => Float, { nullable: true })
  medianReliabilityScore!: number | null

  @Field(() => Float, { nullable: true })
  highestReliabilityScore!: number | null

  @Field(() => CourierAnalyticsTopCourier, { nullable: true })
  topCourier!: CourierAnalyticsTopCourier | null
}

@ObjectType()
export class CourierAnalyticsMonthlyActivity {
  @Field()
  month!: string

  @Field(() => Int)
  assignedRoutes!: number

  @Field(() => Int)
  completedRoutes!: number

  @Field(() => Int)
  deliveredStops!: number

  @Field(() => Int)
  deliveredOrders!: number

  @Field(() => Int)
  deliveredVaccineQuantity!: number

  @Field(() => Int)
  onTimeStops!: number

  @Field(() => Int)
  lateStops!: number
}

@ObjectType()
export class CourierAnalyticsNamedCount {
  @Field()
  key!: string

  @Field(() => Int)
  count!: number
}

@ObjectType()
export class CourierAnalyticsDataQuality {
  @Field(() => Int)
  legacyRoutesWithoutRequiredFields!: number

  @Field(() => Int)
  deliveredStopsWithoutTimestamp!: number

  @Field(() => Int)
  invalidStopSequences!: number

  @Field(() => Int)
  missingOrders!: number

  @Field(() => Int)
  invalidHandlingDurations!: number

  @Field(() => Int)
  malformedProofs!: number
}

@ObjectType()
export class CourierPerformanceAnalytics {
  @Field()
  generatedAt!: Date

  @Field(() => CourierAnalyticsSummary)
  summary!: CourierAnalyticsSummary

  @Field(() => [CourierAnalyticsRanking])
  courierRankings!: CourierAnalyticsRanking[]

  @Field(() => [CourierAnalyticsMonthlyActivity])
  monthlyActivity!: CourierAnalyticsMonthlyActivity[]

  @Field(() => [CourierAnalyticsNamedCount])
  routeStatusDistribution!: CourierAnalyticsNamedCount[]

  @Field(() => [CourierAnalyticsNamedCount])
  deliveryTimelinessDistribution!: CourierAnalyticsNamedCount[]

  @Field(() => [CourierAnalyticsNamedCount])
  deliveryProofDistribution!: CourierAnalyticsNamedCount[]

  @Field(() => CourierAnalyticsDataQuality)
  dataQuality!: CourierAnalyticsDataQuality
}
