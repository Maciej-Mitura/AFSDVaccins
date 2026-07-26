import { Field, ID, Int, ObjectType } from '@nestjs/graphql'

import { OrderStatus } from '../../order/order-status.enum'
import { Address } from '../../profile/address.type'
import { RouteStatus } from '../route-status.enum'

/**
 * Safe per-order reference inside a pharmacist planned-delivery stop group.
 * Never includes QR bearer material.
 */
@ObjectType('MyPlannedDeliveryOrderLine')
export class MyPlannedDeliveryOrderLine {
  @Field(() => ID)
  vaccineId!: string

  @Field()
  vaccineName!: string

  @Field(() => Int)
  quantity!: number
}

@ObjectType('MyPlannedDeliveryOrder')
export class MyPlannedDeliveryOrder {
  @Field(() => ID)
  orderId!: string

  @Field(() => OrderStatus)
  status!: OrderStatus

  @Field(() => [MyPlannedDeliveryOrderLine])
  lines!: MyPlannedDeliveryOrderLine[]
}

/**
 * One generated route stop belonging to the authenticated pharmacist.
 * Groups all orders for that stop; never exposes encodedToken / nonceHash.
 */
@ObjectType('MyPlannedDelivery')
export class MyPlannedDelivery {
  @Field(() => ID)
  routeId!: string

  /** Null for legacy / malformed stops that never received a stable stopId. */
  @Field(() => ID, { nullable: true })
  stopId!: string | null

  @Field()
  routeDate!: string

  @Field(() => RouteStatus)
  routeStatus!: RouteStatus

  @Field(() => Int)
  stopSequence!: number

  @Field()
  pharmacyName!: string

  @Field(() => Address)
  address!: Address

  @Field(() => Int)
  orderCount!: number

  @Field(() => [ID])
  orderIds!: string[]

  @Field(() => [MyPlannedDeliveryOrder])
  orders!: MyPlannedDeliveryOrder[]

  @Field(() => Int)
  totalLineCount!: number

  @Field(() => Int)
  totalQuantity!: number

  @Field(() => Boolean)
  qrAvailable!: boolean

  @Field(() => Boolean)
  qrConsumed!: boolean

  @Field(() => Date, { nullable: true })
  deliveredAt!: Date | null

  /**
   * Relative authenticated SVG path when an active QR may still be retrieved.
   */
  @Field(() => String, { nullable: true })
  qrImagePath!: string | null
}
