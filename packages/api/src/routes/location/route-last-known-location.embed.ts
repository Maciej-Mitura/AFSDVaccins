import { Field, ID, Int, ObjectType } from '@nestjs/graphql'
import { Column } from 'typeorm'

import { RouteLocationSource } from './route-location-source.enum'

/**
 * Route-level coarse courier location (Phase 30A).
 *
 * City is copied from the generated stop address snapshot at the time of an
 * authoritative ARRIVAL or DELIVERY event. Never stores GPS coordinates,
 * full address duplication beyond city, QR tokens, or device data.
 *
 * GraphQL exposes only safe fields via {@link RouteLocationStatus}.
 * Internal correlation (`eventId`, profile ids) stay persistence-only.
 */
@ObjectType('RouteLastKnownLocation')
export class RouteLastKnownLocation {
  @Column()
  @Field(() => ID)
  stopId!: string

  @Column()
  @Field(() => Int)
  stopSequence!: number

  /** Snapshotted pharmacy city from the generated stop — not live geolocation. */
  @Column()
  @Field()
  city!: string

  @Column()
  @Field()
  recordedAt!: Date

  @Column()
  @Field(() => RouteLocationSource)
  source!: RouteLocationSource

  @Column()
  recordedByUserId!: string

  @Column()
  recordedByBezorgerProfileId!: string

  /**
   * Correlation id for idempotent location writes.
   * Persistence-only — never GraphQL-exposed.
   */
  @Column()
  eventId!: string
}
