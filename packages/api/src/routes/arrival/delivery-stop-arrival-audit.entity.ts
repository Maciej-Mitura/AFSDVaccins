import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ObjectIdColumn,
} from 'typeorm'
import { ObjectId } from 'mongodb'

export enum DeliveryStopArrivalAuditEventType {
  DELIVERY_STOP_ARRIVAL_RECORDED = 'DELIVERY_STOP_ARRIVAL_RECORDED',
}

/**
 * Append-only stop-arrival audit.
 * Never stores bearer tokens, QR data, full pending-action payloads, or secrets.
 *
 * Unique on (courierUserId, idempotencyKey) so the same client key cannot be
 * reused for a different route/stop by the same actor.
 * Unique on (routeId, stopId) so concurrent first-writes create one audit row.
 */
@Entity('delivery_stop_arrival_audit_events')
@Index(['courierUserId', 'idempotencyKey'], { unique: true })
@Index(['routeId', 'stopId'], { unique: true })
export class DeliveryStopArrivalAuditEvent {
  @ObjectIdColumn()
  _id!: string | ObjectId

  @Column()
  type!: DeliveryStopArrivalAuditEventType

  @Index()
  @Column()
  routeId!: string

  @Column()
  stopId!: string

  @Index()
  @Column()
  courierUserId!: string

  @Column()
  courierBezorgerProfileId!: string

  @Column()
  recipientCity!: string

  @Column()
  clientArrivedAt!: Date

  @Column()
  recordedAt!: Date

  /** Client idempotency key (bounded). Not a secret. */
  @Column()
  idempotencyKey!: string

  @CreateDateColumn()
  createdAt!: Date
}
