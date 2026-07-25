import { Column, CreateDateColumn, Entity, Index, ObjectIdColumn } from 'typeorm'
import { ObjectId } from 'mongodb'

import { DeliveryProofMethod } from './delivery-proof-method.enum'

export enum DeliveryQrConfirmAuditEventType {
  DELIVERY_STOP_CONFIRMED_BY_QR = 'DELIVERY_STOP_CONFIRMED_BY_QR',
}

/**
 * Append-only QR stop confirmation audit.
 * Never stores token, nonce, nonceHash, signature, encodedToken, or secrets.
 */
@Entity('delivery_qr_confirm_audit_events')
export class DeliveryQrConfirmAuditEvent {
  @ObjectIdColumn()
  _id!: string | ObjectId

  /** Correlation id shared with `deliveryProof.confirmationEventId` (unique). */
  @Index({ unique: true })
  @Column()
  confirmationEventId!: string

  @Column()
  type!: DeliveryQrConfirmAuditEventType

  @Index()
  @Column()
  routeId!: string

  @Column()
  stopId!: string

  @Column()
  courierUserId!: string

  @Column()
  recipientProfileId!: string

  @Column()
  recipientCity!: string

  @Column()
  orderCount!: number

  /** Bounded associated order ids (exact stop set at confirmation). */
  @Column()
  orderIds!: string[]

  @Column()
  deliveredAt!: Date

  @Column()
  proofMethod!: DeliveryProofMethod

  @CreateDateColumn()
  createdAt!: Date
}
