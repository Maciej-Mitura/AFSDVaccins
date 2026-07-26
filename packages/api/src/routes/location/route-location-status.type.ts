import { Field, ID, Int, ObjectType } from '@nestjs/graphql'

import { RouteLocationSource } from './route-location-source.enum'

/**
 * Safe next-stop summary for ADMIN / assigned BEZORGER.
 * Never exposes apotheker user/profile ids or unrelated stop lists.
 */
@ObjectType('RouteNextStopSummary')
export class RouteNextStopSummary {
  @Field(() => ID)
  stopId!: string

  @Field(() => Int)
  sequence!: number

  @Field()
  pharmacyName!: string

  @Field()
  city!: string
}

/**
 * Provider-neutral safe route location output (Phase 30A).
 * Does not expose eventId, Firebase UIDs, coordinates, or private profiles.
 */
@ObjectType('RouteLocationStatus')
export class RouteLocationStatus {
  @Field(() => Boolean)
  hasLocation!: boolean

  @Field(() => String, { nullable: true })
  city!: string | null

  @Field(() => Date, { nullable: true })
  recordedAt!: Date | null

  @Field(() => RouteLocationSource, { nullable: true })
  source!: RouteLocationSource | null

  @Field(() => Int, { nullable: true })
  stopSequence!: number | null

  @Field(() => Boolean)
  hasNextStop!: boolean

  @Field(() => RouteNextStopSummary, { nullable: true })
  nextStop!: RouteNextStopSummary | null
}
