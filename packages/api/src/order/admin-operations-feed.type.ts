import { Field, ObjectType, registerEnumType } from '@nestjs/graphql'

import { Vaccine } from '../vaccine/vaccine.entity'
import { Order } from './order.entity'

export enum AdminOperationsEventType {
  NEW_ORDER = 'NEW_ORDER',
  ORDER_STATUS_CHANGED = 'ORDER_STATUS_CHANGED',
  LOW_STOCK = 'LOW_STOCK',
}

registerEnumType(AdminOperationsEventType, {
  name: 'AdminOperationsEventType',
  description: 'Operational events for the admin realtime feed',
})

@ObjectType()
export class AdminOperationsFeedEvent {
  @Field(() => AdminOperationsEventType)
  eventType!: AdminOperationsEventType

  @Field()
  occurredAt!: Date

  @Field(() => String, { nullable: true })
  message?: string | null

  @Field(() => Order, { nullable: true })
  order?: Order | null

  @Field(() => Vaccine, { nullable: true })
  vaccine?: Vaccine | null
}
