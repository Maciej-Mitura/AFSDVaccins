import { Field, ID, Int, ObjectType } from '@nestjs/graphql'

@ObjectType('DailyVaccineAllowance')
export class DailyVaccineAllowance {
  @Field(() => ID)
  vaccineId!: string

  @Field()
  vaccineName!: string

  @Field(() => Int)
  dailyMaximum!: number

  @Field(() => Int)
  orderedToday!: number

  @Field(() => Int)
  remainingToday!: number
}

@ObjectType('MyDailyVaccineAllowances')
export class MyDailyVaccineAllowances {
  @Field({
    description:
      'Resolved delivery date for the current ordering window (settings timezone + closing time)',
  })
  deliveryDate!: string

  @Field(() => [DailyVaccineAllowance])
  allowances!: DailyVaccineAllowance[]
}
