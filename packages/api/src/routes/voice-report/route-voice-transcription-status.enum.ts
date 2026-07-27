import { registerEnumType } from '@nestjs/graphql'

/**
 * Nested transcription processing status (Phase 34B).
 * Report storage status remains UPLOADING / AVAILABLE / UPLOAD_FAILED.
 */
export enum RouteVoiceTranscriptionStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

registerEnumType(RouteVoiceTranscriptionStatus, {
  name: 'RouteVoiceTranscriptionStatus',
  description:
    'Machine transcription lifecycle for an AVAILABLE route voice report',
})
