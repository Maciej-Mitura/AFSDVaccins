import { Field, Int, ObjectType } from '@nestjs/graphql'

import { AdminOrderStatusCount } from './admin-daily-order-overview.type'
import { AdminDailyVaccineQuantity } from './admin-daily-order-overview.type'

@ObjectType()
export class AdminWeeklyStatistics {
  @Field(() => Int)
  isoYear!: number

  @Field(() => Int)
  isoWeek!: number

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

  @Field(() => [AdminDailyVaccineQuantity])
  vaccineQuantities!: AdminDailyVaccineQuantity[]
}
