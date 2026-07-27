import gql from 'graphql-tag'

export const courierPerformanceAnalyticsQuerySource = gql`
  query CourierPerformanceAnalytics($refresh: Boolean) {
    courierPerformanceAnalytics(refresh: $refresh) {
      generatedAt
      summary {
        courierCount
        couriersWithEligibleData
        currentBezorgerProfilesWithZeroRoutes
        totalAssignedRoutes
        totalCompletedRoutes
        totalCancelledRoutes
        totalDeliveredStops
        totalDeliveredOrders
        totalDeliveredVaccineQuantity
        overallRouteCompletionRate
        overallDeliveryCompletionRate
        overallOnTimeRate
        overallQrConfirmationRate
        averageReliabilityScore
        medianReliabilityScore
        highestReliabilityScore
        topCourier {
          courierProfileId
          displayName
          totalScore
        }
      }
      courierRankings {
        courierProfileId
        courierUserId
        displayName
        vehicleLabel
        rank
        totalScore
        dataCompleteness
        componentScores {
          routeCompletion
          deliveryCompletion
          onTime
          qrConfirmation
          operationalConsistency
        }
        weightedContributions {
          routeCompletion
          deliveryCompletion
          onTime
          qrConfirmation
          operationalConsistency
        }
        rawMetrics {
          totalAssignedRoutes
          completedRoutes
          incompleteRoutes
          cancelledRoutes
          activeRoutes
          routeCompletionRate
          totalEligibleStops
          deliveredStops
          undeliveredOverdueStops
          deliveryCompletionRate
          totalOrdersDelivered
          totalVaccineQuantityDelivered
          deliveredStopsWithValidTimestamp
          onTimeDeliveredStops
          lateDeliveredStops
          onTimeDeliveryRate
          deliveredStopsWithValidProofMethod
          qrConfirmedStops
          qrConfirmationRate
          consistencyIssueCount
          consistencyEligibleUnits
          consistencyScore
          averageHandlingDurationSeconds
          medianHandlingDurationSeconds
          handlingDurationSampleCount
        }
        consistencyIssueBreakdown {
          overdueIncompleteRoutes
          abandonedProcessingConfirmations
          invalidOrIncompleteProofs
        }
      }
      monthlyActivity {
        month
        assignedRoutes
        completedRoutes
        deliveredStops
        deliveredOrders
        deliveredVaccineQuantity
        onTimeStops
        lateStops
      }
      routeStatusDistribution {
        key
        count
      }
      deliveryTimelinessDistribution {
        key
        count
      }
      deliveryProofDistribution {
        key
        count
      }
      dataQuality {
        legacyRoutesWithoutRequiredFields
        deliveredStopsWithoutTimestamp
        invalidStopSequences
        missingOrders
        invalidHandlingDurations
        malformedProofs
      }
    }
  }
`

export type {
  CourierPerformanceAnalyticsQuery,
  CourierPerformanceAnalyticsQueryVariables,
} from '@vaccin-delivery/types'
export { CourierPerformanceAnalyticsDocument as COURIER_PERFORMANCE_ANALYTICS_QUERY } from '@vaccin-delivery/types'
