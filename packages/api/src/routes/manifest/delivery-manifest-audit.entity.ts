import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ObjectIdColumn,
} from 'typeorm'
import { ObjectId } from 'mongodb'

import { UserRole } from '../../user/user-role.enum'
import type { ManifestScope } from './delivery-manifest.types'

export enum DeliveryManifestAuditEventType {
  DELIVERY_MANIFEST_GENERATED = 'DELIVERY_MANIFEST_GENERATED',
}

/**
 * Append-only delivery-manifest generation audit.
 * Never stores PDF bytes, QR tokens, order contents, or secrets.
 */
@Entity('delivery_manifest_audit_events')
@Index(['routeId', 'generatedAt'])
@Index(['actorUserId', 'generatedAt'])
export class DeliveryManifestAuditEvent {
  @ObjectIdColumn()
  _id!: string | ObjectId

  @Column()
  type!: DeliveryManifestAuditEventType

  @Index()
  @Column()
  routeId!: string

  @Column({ nullable: true })
  stopId?: string | null

  @Column()
  scope!: ManifestScope

  @Index()
  @Column()
  actorUserId!: string

  @Column()
  actorRole!: UserRole

  @Column()
  generatedAt!: Date

  @CreateDateColumn()
  createdAt!: Date
}
