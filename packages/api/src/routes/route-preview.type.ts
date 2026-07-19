import { Field, ID, Int, ObjectType } from '@nestjs/graphql'

import { RoutePreviewStop } from './route-preview-stop.type'

@ObjectType('RoutePreview')
export class RoutePreview {
  @Field()
  deliveryDate!: string

  @Field(() => ID)
  bezorgerProfileId!: string

  @Field(() => ID)
  routeTemplateId!: string

  @Field()
  routeTemplateName!: string

  @Field(() => [RoutePreviewStop])
  stops!: RoutePreviewStop[]

  @Field(() => [ID])
  skippedApothekerProfileIds!: string[]

  @Field(() => Int)
  totalStops!: number

  @Field(() => Int)
  totalOrders!: number

  @Field(() => Int)
  totalQuantity!: number

  @Field()
  computedAt!: Date
}
