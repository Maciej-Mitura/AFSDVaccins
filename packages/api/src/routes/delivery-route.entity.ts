import { Field, ID, ObjectType } from '@nestjs/graphql'
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ObjectIdColumn,
  UpdateDateColumn,
} from 'typeorm'

import { DeliveryStop } from './delivery-stop.embed'
import { RouteLastKnownLocation } from './location/route-last-known-location.embed'
import { RouteStatus } from './route-status.enum'
import { RouteStatusHistoryEntry } from './route-status-history.type'

@Entity('delivery_routes')
@ObjectType('DeliveryRoute')
@Index(['bezorgerProfileId', 'deliveryDate'], { unique: true })
export class DeliveryRoute {
  @ObjectIdColumn()
  _id!: string

  @Field(() => ID)
  get id(): string {
    return this._id
  }

  @Index()
  @Column()
  @Field(() => ID)
  routeTemplateId!: string

  @Index()
  @Column()
  @Field(() => ID)
  bezorgerProfileId!: string

  @Index()
  @Column()
  @Field()
  deliveryDate!: string

  @Index()
  @Column({ default: RouteStatus.ASSIGNED })
  @Field(() => RouteStatus)
  status!: RouteStatus

  @Column()
  @Field(() => [DeliveryStop])
  stops!: DeliveryStop[]

  /**
   * Coarse courier city from the latest accepted stop arrival or QR delivery
   * (Phase 30A). Persistence embed — GraphQL exposes safe projection via
   * `locationStatus` ResolveField. Never stores GPS coordinates.
   */
  @Column({ nullable: true })
  lastKnownLocation?: RouteLastKnownLocation | null

  /**
   * Apotheker profile IDs from the template that were skipped because they had
   * no qualifying orders for this delivery date (not skipped order IDs).
   */
  @Column({ default: [] })
  @Field(() => [ID], { defaultValue: [] })
  skippedApothekerProfileIds!: string[]

  @Column({ default: [] })
  @Field(() => [RouteStatusHistoryEntry], { defaultValue: [] })
  statusHistory!: RouteStatusHistoryEntry[]

  @Column()
  @Field()
  generatedAt!: Date

  @Column()
  @Field(() => ID)
  generatedByUserId!: string

  @CreateDateColumn()
  @Field()
  createdAt!: Date

  @UpdateDateColumn()
  @Field()
  updatedAt!: Date
}
