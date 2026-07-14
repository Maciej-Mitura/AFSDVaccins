import { Field, Int, ObjectType } from '@nestjs/graphql'

@ObjectType('WeeklyOrderSummary')
export class WeeklyOrderSummary {
  @Field(() => Int)
  isoYear!: number

  @Field(() => Int)
  isoWeek!: number

  @Field(() => Int)
  orderedQuantity!: number

  @Field(() => Int)
  weeklyLimit!: number

  @Field(() => Int)
  percentageUsed!: number

  @Field()
  warningReached!: boolean

  @Field(() => Int)
  remainingQuantity!: number
}
