import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ObjectIdColumn,
  UpdateDateColumn,
} from 'typeorm'
import { ObjectId } from 'mongodb'

import { RouteVoiceReportStatus } from './route-voice-report-status.enum'
import { RouteVoiceReportTranscription } from './route-voice-report-transcription.embed'
import { RouteVoiceTranscriptionStatus } from './route-voice-transcription-status.enum'

/**
 * Route-scoped operational voice report metadata (Phase 34A + 34B).
 * Audio bytes live in private Azure Blob Storage — never in Mongo.
 *
 * Storage status (UPLOADING / AVAILABLE / UPLOAD_FAILED) is unchanged from 34A.
 * Transcription lifecycle lives in nested `transcription` (PENDING…FAILED).
 *
 * Unique (routeId, sequenceNumber) protects concurrent sequence allocation.
 * Unique (recordedByUserId, routeId, clientUploadId) scopes idempotency.
 */
@Entity('route_voice_reports')
@Index(['routeId', 'sequenceNumber'], { unique: true })
@Index(['recordedByUserId', 'routeId', 'clientUploadId'], { unique: true })
@Index(['routeId', 'createdAt'])
@Index(['bezorgerProfileId'])
@Index(['transcription.status', 'transcription.processingLeaseExpiresAt'])
@Index(['status', 'transcription.status', 'updatedAt'])
export class RouteVoiceReport {
  @ObjectIdColumn()
  _id!: string | ObjectId

  get id(): string {
    return this._id.toString()
  }

  @Index()
  @Column()
  routeId!: string

  @Column()
  bezorgerProfileId!: string

  @Column()
  recordedByUserId!: string

  /** Route-scoped display order starting at 1. */
  @Column()
  sequenceNumber!: number

  @Column()
  status!: RouteVoiceReportStatus

  /** Opaque server-generated blob path. Never expose via GraphQL/REST. */
  @Column()
  blobName!: string

  /** Logical container name (e.g. route-voice-reports). */
  @Column()
  containerName!: string

  @Column()
  mimeType!: string

  @Column({ nullable: true })
  codec!: string | null

  @Column()
  fileExtension!: string

  @Column()
  sizeBytes!: number

  /**
   * Client-declared duration (seconds), bounded and untrusted.
   * Phase 34A does not claim cryptographic/server-authoritative duration.
   */
  @Column()
  durationSeconds!: number

  /** Hex SHA-256 of uploaded bytes. Integrity only — never expose in UI. */
  @Column()
  sha256!: string

  @Column()
  clientRecordedAt!: Date

  @Column()
  uploadedAt!: Date

  @Column({ nullable: true })
  selectedLocale!: string | null

  /** Bounded browser format label; optional. */
  @Column({ nullable: true })
  browserFormatLabel!: string | null

  /** Client idempotency key (UUID-like). Scoped with recordedByUserId + routeId. */
  @Column()
  clientUploadId!: string

  /**
   * Safe hash of immutable upload fingerprint (mime, size, duration, sha256, …).
   * Used to reject incompatible idempotent replays without storing audio.
   */
  @Column()
  idempotencyFingerprint!: string

  /**
   * Nested machine transcription state (Phase 34B).
   * Absent on pre-34B documents → treated as NOT_REQUESTED (no auto backfill).
   */
  @Column(() => RouteVoiceReportTranscription)
  transcription?: RouteVoiceReportTranscription | null

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}

/** Helper: report has an active nested transcription document. */
export function hasTranscriptionObject(
  report: RouteVoiceReport,
): report is RouteVoiceReport & {
  transcription: RouteVoiceReportTranscription
} {
  return report.transcription != null && typeof report.transcription === 'object'
}

export function isTranscriptionStatus(
  report: RouteVoiceReport,
  status: RouteVoiceTranscriptionStatus,
): boolean {
  return hasTranscriptionObject(report) && report.transcription.status === status
}
