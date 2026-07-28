import { Field, Int, ObjectType } from '@nestjs/graphql'
import { Column } from 'typeorm'

/**
 * Bounded interpolation payload exposed to GraphQL.
 * Only known scalar placeholders — never full domain objects or secrets.
 */
@ObjectType('NotificationInterpolationData')
export class NotificationInterpolationDataFields {
  @Column({ nullable: true })
  @Field(() => String, { nullable: true })
  routeDate?: string | null

  @Column({ nullable: true })
  @Field(() => String, { nullable: true })
  pharmacyName?: string | null

  @Column({ nullable: true })
  @Field(() => String, { nullable: true })
  city?: string | null

  @Column({ nullable: true })
  @Field(() => String, { nullable: true })
  orderReference?: string | null

  @Column({ nullable: true })
  @Field(() => Int, { nullable: true })
  orderCount?: number | null

  @Column({ nullable: true })
  @Field(() => Int, { nullable: true })
  stopCount?: number | null

  @Column({ nullable: true })
  @Field(() => Int, { nullable: true })
  doseCount?: number | null

  @Column({ nullable: true })
  @Field(() => Int, { nullable: true })
  warningPercentage?: number | null

  @Column({ nullable: true })
  @Field(() => Int, { nullable: true })
  weeklyDoseCap?: number | null

  @Column({ nullable: true })
  @Field(() => String, { nullable: true })
  vaccineName?: string | null

  @Column({ nullable: true })
  @Field(() => Int, { nullable: true })
  quantityRemaining?: number | null

  @Column({ nullable: true })
  @Field(() => Int, { nullable: true })
  stockThreshold?: number | null
}
