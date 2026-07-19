import { Field, ID, Int, ObjectType } from '@nestjs/graphql'

import { Address } from '../profile/address.type'
import { OrderLineSnapshot } from './order-line-snapshot.embed'

@ObjectType('RoutePreviewStop')
export class RoutePreviewStop {
  @Field(() => Int)
  sequence!: number

  @Field(() => ID)
  apothekerProfileId!: string

  @Field(() => ID)
  apothekerUserId!: string

  @Field()
  pharmacyName!: string

  @Field(() => Address)
  address!: Address

  @Field(() => [ID])
  orderIds!: string[]

  @Field(() => Int)
  orderCount!: number

  @Field(() => Int)
  totalQuantity!: number

  @Field(() => [OrderLineSnapshot])
  lines!: OrderLineSnapshot[]
}
