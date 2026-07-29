import { Field, ID, Int, ObjectType } from '@nestjs/graphql'

import { DeliveryRoute } from './delivery-route.entity'
import { RouteGenerationSkipReasonCode } from './route-generation-skip-reason.enum'

export { RouteGenerationSkipReasonCode }

@ObjectType('RouteGenerationSkipGroup')
export class RouteGenerationSkipGroup {
  @Field(() => RouteGenerationSkipReasonCode)
  code!: RouteGenerationSkipReasonCode

  @Field(() => Int)
  count!: number

  @Field(() => [ID], { defaultValue: [] })
  apothekerProfileIds!: string[]

  @Field(() => [ID], { defaultValue: [] })
  orderIds!: string[]

  /** Safe pharmacy display names when authorised; never private account fields. */
  @Field(() => [String], { defaultValue: [] })
  pharmacyNames!: string[]
}

@ObjectType('RouteGenerationDiagnostics')
export class RouteGenerationDiagnostics {
  @Field(() => Int)
  includedOrderCount!: number

  @Field(() => Int)
  includedStopCount!: number

  @Field(() => Int)
  skippedOrderCount!: number

  @Field(() => Int)
  skippedPharmacyCount!: number

  /** True when this call updated an existing route document. */
  @Field(() => Boolean)
  regenerated!: boolean

  /**
   * True when an existing route cannot be regenerated (e.g. IN_PROGRESS) and
   * new eligible orders exist, or when diagnostics are read-only and new
   * eligible orders arrived after generation.
   */
  @Field(() => Boolean)
  regenerationNeeded!: boolean

  @Field(() => [RouteGenerationSkipGroup], { defaultValue: [] })
  skipGroups!: RouteGenerationSkipGroup[]
}

@ObjectType('DeliveryRouteGenerationResult')
export class DeliveryRouteGenerationResult {
  @Field(() => DeliveryRoute)
  route!: DeliveryRoute

  @Field(() => RouteGenerationDiagnostics)
  diagnostics!: RouteGenerationDiagnostics
}

/**
 * ADMIN-only read model for route planning freshness and omission explainability.
 * Does not mutate data.
 */
@ObjectType('RoutePlanningDiagnostics')
export class RoutePlanningDiagnostics {
  @Field()
  deliveryDate!: string

  @Field(() => ID, { nullable: true })
  routeTemplateId!: string | null

  @Field(() => ID, { nullable: true })
  routeId!: string | null

  @Field(() => Date, { nullable: true })
  routeGeneratedAt!: Date | null

  @Field(() => Int)
  eligibleUnplannedOrderCount!: number

  @Field(() => Int)
  includedOrderCount!: number

  @Field(() => Int)
  includedStopCount!: number

  @Field(() => Int)
  skippedOrderCount!: number

  @Field(() => Int)
  skippedPharmacyCount!: number

  @Field(() => Boolean)
  regenerationNeeded!: boolean

  @Field(() => Boolean)
  canRegenerate!: boolean

  @Field(() => [RouteGenerationSkipGroup], { defaultValue: [] })
  skipGroups!: RouteGenerationSkipGroup[]
}
