import { Field, ID, Int, ObjectType } from '@nestjs/graphql'

import { OrderStatus } from './order-status.enum'

@ObjectType()
export class AdminOrderStatusCount {
  @Field(() => OrderStatus)
  status!: OrderStatus

  @Field(() => Int)
  count!: number
}

@ObjectType()
export class AdminDailyVaccineQuantity {
  @Field(() => ID)
  vaccineId!: string

  @Field()
  vaccineName!: string

  @Field(() => Int)
  quantity!: number
}

@ObjectType()
export class AdminDailyPharmacistSummary {
  @Field(() => ID)
  apothekerId!: string

  @Field(() => Int)
  orderCount!: number

  @Field(() => Int)
  totalDoses!: number
}

@ObjectType()
export class AdminDailyOrderOverview {
  @Field()
  deliveryDate!: string

  @Field(() => Int)
  totalOrders!: number

  @Field(() => Int)
  totalDoses!: number

  @Field(() => Int)
  cancelledOrderCount!: number

  @Field(() => Int)
  cancelledDoseCount!: number

  @Field(() => [AdminOrderStatusCount])
  statusCounts!: AdminOrderStatusCount[]

  @Field(() => [AdminDailyPharmacistSummary])
  pharmacistSummaries!: AdminDailyPharmacistSummary[]

  @Field(() => [AdminDailyVaccineQuantity])
  vaccineQuantities!: AdminDailyVaccineQuantity[]
}
