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
}

/**
 * Append-only voice-report creation audit.
 * Never stores audio bytes, blob URLs, Azure credentials, bearer tokens,
 * or original client filenames.
 */
@Entity('route_voice_report_audit_events')
@Index(['reportId'], { unique: true })
@Index(['routeId', 'createdAt'])
export class RouteVoiceReportAuditEvent {
  @ObjectIdColumn()
  _id!: string | ObjectId

  @Column()
  type!: RouteVoiceReportAuditEventType

  @Index()
  @Column()
  routeId!: string

  @Column()
  reportId!: string

  @Column()
  sequenceNumber!: number

  @Column()
  bezorgerProfileId!: string

  @Column()
  actorUserId!: string

  @Column()
  durationSeconds!: number

  @Column()
  sizeBytes!: number

  @Column()
  mimeType!: string

  @Column({ nullable: true })
  selectedLocale!: string | null

  @Column()
  createdAt!: Date

  @CreateDateColumn()
  recordedAt!: Date
}
