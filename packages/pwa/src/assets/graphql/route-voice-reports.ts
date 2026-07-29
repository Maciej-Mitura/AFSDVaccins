import gql from 'graphql-tag'
import type {
  RouteVoiceReportsQuery as GeneratedRouteVoiceReportsQuery,
  RouteVoiceReportsQueryVariables,
  RouteVoiceReportUpdatesSubscription as GeneratedRouteVoiceReportUpdatesSubscription,
  RouteVoiceReportUpdatesSubscriptionVariables,
} from '@vaccin-delivery/types'

/**
 * Runtime query source (Phase 36E stop fields).
 * Prefer this document until @vaccin-delivery/types is regenerated.
 */
export const routeVoiceReportsQuerySource = gql`
  query RouteVoiceReports($routeId: ID!) {
    routeVoiceReports(routeId: $routeId) {
      id
      routeId
      stopId
      stopSequence
      pharmacyDisplayName
      isLegacyRouteReport
      sequenceNumber
      status
      mimeType
      durationSeconds
      effectiveDurationSeconds
      selectedLocale
      clientRecordedAt
      uploadedAt
      recordedByDisplayName
      canPlayAudio
      transcriptionStatus
      requestedLocale
      detectedLocale
      transcript
      confidence
      transcriptionStartedAt
      transcriptionCompletedAt
      transcriptionFailureCode
      canRetryTranscription
    }
  }
`

/** Phase 36E stop-scoped fields not yet in generated types. */
export type RouteVoiceReportStopFields = {
  stopId?: string | null
  stopSequence?: number | null
  pharmacyDisplayName?: string | null
  isLegacyRouteReport?: boolean | null
}

export type RouteVoiceReportsQuery = {
  routeVoiceReports: Array<
    GeneratedRouteVoiceReportsQuery['routeVoiceReports'][number] &
      RouteVoiceReportStopFields
  >
}

export type { RouteVoiceReportsQueryVariables }

/** Use local document so stop fields are requested at runtime. */
export const ROUTE_VOICE_REPORTS_QUERY = routeVoiceReportsQuerySource

export const routeVoiceReportUpdatesSubscriptionSource = gql`
  subscription RouteVoiceReportUpdates {
    routeVoiceReportUpdates {
      routeId
      reportId
      stopId
      status
      transcriptionStatus
      eventType
    }
  }
`

export type RouteVoiceReportUpdatesSubscription = {
  routeVoiceReportUpdates: GeneratedRouteVoiceReportUpdatesSubscription['routeVoiceReportUpdates'] & {
    stopId?: string | null
  }
}

export type { RouteVoiceReportUpdatesSubscriptionVariables }

export const ROUTE_VOICE_REPORT_UPDATES_SUBSCRIPTION =
  routeVoiceReportUpdatesSubscriptionSource
