import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ObjectIdColumn,
} from 'typeorm'
import { ObjectId } from 'mongodb'

import { RouteLocationSource } from './route-location-source.enum'

export enum DeliveryRouteLocationAuditEventType {
  DELIVERY_ROUTE_LOCATION_UPDATED = 'DELIVERY_ROUTE_LOCATION_UPDATED',
}

/**
 * Append-only coarse location audit (Phase 30A).
 * Unique on eventId so idempotent replay does not duplicate rows.
 * Never stores coordinates, full address, QR tokens, push, or device data.
 */
@Entity('delivery_route_location_audit_events')
@Index(['eventId'], { unique: true })
export class DeliveryRouteLocationAuditEvent {
  @ObjectIdColumn()
  _id!: string | ObjectId

  @Column()
  type!: DeliveryRouteLocationAuditEventType

  @Index()
  @Column()
  routeId!: string

  @Column()
  stopId!: string

  @Column()
  source!: RouteLocationSource

  @Column()
  city!: string

  @Column()
  recordedAt!: Date

  @Index()
  @Column()
  courierUserId!: string

  @Column()
  courierBezorgerProfileId!: string

  /** Correlation id matching lastKnownLocation.eventId. */
  @Column()
  eventId!: string

  @CreateDateColumn()
  createdAt!: Date
}
