import { Field, ID, Int, ObjectType } from '@nestjs/graphql'
import { Column } from 'typeorm'

import { Address } from '../profile/address.type'
import { OrderLineSnapshot } from './order-line-snapshot.embed'

@ObjectType('DeliveryStop')
export class DeliveryStop {
  @Column()
  @Field(() => Int)
  sequence!: number

  @Column()
  @Field(() => ID)
  apothekerProfileId!: string

  @Column()
  @Field(() => ID)
  apothekerUserId!: string

  @Column()
  @Field()
  pharmacyName!: string

  @Column()
  @Field(() => Address)
  address!: Address

  @Column()
  @Field(() => [ID])
  orderIds!: string[]

  @Column()
  @Field(() => Int)
  orderCount!: number

  @Column()
  @Field(() => Int)
  totalQuantity!: number

  @Column()
  @Field(() => [OrderLineSnapshot])
  lines!: OrderLineSnapshot[]
}
