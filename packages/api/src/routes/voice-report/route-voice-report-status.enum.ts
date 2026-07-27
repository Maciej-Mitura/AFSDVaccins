import { registerEnumType } from '@nestjs/graphql'

/**
 * Phase 34A creation lifecycle. Only AVAILABLE appears in normal listing.
 * Transcription statuses are intentionally absent.
 */
export enum RouteVoiceReportStatus {
  UPLOADING = 'UPLOADING',
  AVAILABLE = 'AVAILABLE',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
}

registerEnumType(RouteVoiceReportStatus, {
  name: 'RouteVoiceReportStatus',
  description:
    'Voice-report creation lifecycle. Only AVAILABLE is returned by normal listing.',
})
