import { Column, CreateDateColumn, Entity, Index, ObjectIdColumn } from 'typeorm'
import { ObjectId } from 'mongodb'

export enum CourierAnalyticsAuditEventType {
  COURIER_ANALYTICS_EXPORTED = 'COURIER_ANALYTICS_EXPORTED',
}

/**
 * Append-only audit for ADMIN courier analytics CSV export.
 * Never stores CSV bytes, emails, Firebase UIDs, or secrets.
 */
@Entity('courier_analytics_audit_events')
export class CourierAnalyticsAuditEvent {
  @ObjectIdColumn()
  _id!: string | ObjectId

  @Column()
  type!: CourierAnalyticsAuditEventType

  @Index()
  @Column()
  actorUserId!: string

  @Column()
  generatedAt!: Date

  @Column()
  rowCount!: number

  /** Always ALL_TIME in Phase 32A. */
  @Column()
  scope!: string

  /** Always CSV in Phase 32A. */
  @Column()
  format!: string

  @CreateDateColumn()
  createdAt!: Date
}
