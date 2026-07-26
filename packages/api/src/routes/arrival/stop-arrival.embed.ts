import { Field, ID, ObjectType } from '@nestjs/graphql'
import { Column } from 'typeorm'

import { StopArrivalSource } from './stop-arrival-source.enum'

/**
 * Courier “arrived at pharmacy stop” metadata on a generated DeliveryRoute stop.
 * Absent until the first accepted arrival. Immutable afterwards.
 *
 * Independent of deliveryProof / QR consume. RouteTemplate stops stay arrival-free.
 *
 * GraphQL exposes only safe timestamps + actor user id. Profile id, source, and
 * idempotencyKey remain persistence-only.
 */
@ObjectType('StopArrival')
export class StopArrival {
  /** Client clock when the courier pressed Arrived (UTC instant). */
  @Column()
  @Field()
  clientArrivedAt!: Date

  /** Authoritative server acceptance timestamp (UTC instant). */
  @Column()
  @Field()
  recordedAt!: Date

  @Column()
  @Field(() => ID)
  arrivedByUserId!: string

  /** Persistence-only — assigned courier profile at acceptance. */
  @Column()
  arrivedByBezorgerProfileId!: string

  @Column({ default: StopArrivalSource.COURIER })
  source!: StopArrivalSource

  /**
   * Client-generated idempotency key (persistence-only).
   * Scoped to actor + route + stop for replay safety.
   */
  @Column()
  idempotencyKey!: string
}
