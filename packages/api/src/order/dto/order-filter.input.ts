import { Field, ID, InputType, Int } from '@nestjs/graphql'
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator'

import { OrderStatus } from '../order-status.enum'

@InputType()
export class OrderFilterInput {
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  isoYear?: number

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  isoWeek?: number

  @Field(() => OrderStatus, { nullable: true })
  @IsOptional()
  status?: OrderStatus

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  apothekerId?: string

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  deliveryDate?: string
}
