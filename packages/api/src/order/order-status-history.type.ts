import { Field, ID, ObjectType } from '@nestjs/graphql'

import { OrderStatus } from './order-status.enum'

@ObjectType('OrderStatusHistory')
export class OrderStatusHistoryEntry {
  @Field(() => OrderStatus, { nullable: true })
  fromStatus?: OrderStatus | null

  @Field(() => OrderStatus)
  toStatus!: OrderStatus

  @Field()
  changedAt!: Date

  @Field(() => ID)
  changedByUserId!: string

  @Field(() => String, { nullable: true })
  reason?: string | null
}
