import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ObjectIdColumn,
} from 'typeorm'
import { ObjectId } from 'mongodb'

export enum RouteVoiceReportAuditEventType {
  ROUTE_VOICE_REPORT_CREATED = 'ROUTE_VOICE_REPORT_CREATED',
  ROUTE_VOICE_REPORT_TRANSCRIPTION_COMPLETED = 'ROUTE_VOICE_REPORT_TRANSCRIPTION_COMPLETED',
  ROUTE_VOICE_REPORT_TRANSCRIPTION_FAILED = 'ROUTE_VOICE_REPORT_TRANSCRIPTION_FAILED',
  ROUTE_VOICE_REPORT_TRANSCRIPTION_RETRIED = 'ROUTE_VOICE_REPORT_TRANSCRIPTION_RETRIED',
}

/**
 * Append-only voice-report audit (Phase 34A create + Phase 34B transcription).
 * Never stores transcript text, audio bytes, blob URLs, Azure credentials,
 * bearer tokens, or original client filenames.
 *
 * Uniqueness is scoped by (reportId, type, idempotencyKey) so one report can
 * have create + complete + fail + retry rows without colliding.
 */
@Entity('route_voice_report_audit_events')
@Index(['reportId', 'type', 'idempotencyKey'], { unique: true })
@Index(['routeId', 'createdAt'])
export class RouteVoiceReportAuditEvent {
  @ObjectIdColumn()
  _id!: string | ObjectId

  @Column()
  type!: RouteVoiceReportAuditEventType

  /**
   * Dedup key within (reportId, type):
   * - CREATED → "created"
   * - COMPLETED → "completed"
   * - FAILED → "failed:{attemptCount}"
   * - RETRIED → "retried:{retryGeneration}"
   */
  @Column()
  idempotencyKey!: string

  @Index()
  @Column()
  routeId!: string

  @Column()
  reportId!: string

  @Column({ nullable: true })
  sequenceNumber!: number | null

  @Column({ nullable: true })
  bezorgerProfileId!: string | null

  @Column({ nullable: true })
  actorUserId!: string | null

  @Column({ nullable: true })
  durationSeconds!: number | null

  @Column({ nullable: true })
  sizeBytes!: number | null

  @Column({ nullable: true })
  mimeType!: string | null

  @Column({ nullable: true })
  selectedLocale!: string | null

  @Column({ nullable: true })
  provider!: string | null

  @Column({ nullable: true })
  requestedLocale!: string | null

  @Column({ nullable: true })
  detectedLocale!: string | null

  @Column({ nullable: true })
  failureCode!: string | null

  @Column({ nullable: true })
  attemptCount!: number | null

  @Column({ nullable: true })
  previousFailureCode!: string | null

  @Column()
  createdAt!: Date

  @CreateDateColumn()
  recordedAt!: Date
}
