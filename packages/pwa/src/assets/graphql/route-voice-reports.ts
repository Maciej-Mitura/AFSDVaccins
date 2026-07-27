import gql from 'graphql-tag'

export const routeVoiceReportsQuerySource = gql`
  query RouteVoiceReports($routeId: ID!) {
    routeVoiceReports(routeId: $routeId) {
      id
      routeId
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

export type {
  RouteVoiceReportsQuery,
  RouteVoiceReportsQueryVariables,
} from '@vaccin-delivery/types'
export { RouteVoiceReportsDocument as ROUTE_VOICE_REPORTS_QUERY } from '@vaccin-delivery/types'

export const routeVoiceReportUpdatesSubscriptionSource = gql`
  subscription RouteVoiceReportUpdates {
    routeVoiceReportUpdates {
      routeId
      reportId
      status
      transcriptionStatus
      eventType
    }
  }
`

export type {
  RouteVoiceReportUpdatesSubscription,
  RouteVoiceReportUpdatesSubscriptionVariables,
} from '@vaccin-delivery/types'
export { RouteVoiceReportUpdatesDocument as ROUTE_VOICE_REPORT_UPDATES_SUBSCRIPTION } from '@vaccin-delivery/types'
