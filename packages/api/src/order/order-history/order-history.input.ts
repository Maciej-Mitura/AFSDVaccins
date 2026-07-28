import { Field, ID, InputType, Int } from '@nestjs/graphql'
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { Type } from 'class-transformer'

import { OrderStatus } from '../order-status.enum'

export const ORDER_HISTORY_DEFAULT_FIRST = 25
export const ORDER_HISTORY_MAX_FIRST = 50
export const ORDER_HISTORY_MAX_SEARCH_LENGTH = 64

const DELIVERY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

@InputType('OrderHistoryInput')
export class OrderHistoryInput {
  @Field(() => OrderStatus, { nullable: true })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(DELIVERY_DATE_PATTERN, {
    message: 'deliveryDateFrom must be YYYY-MM-DD',
  })
  deliveryDateFrom?: string

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(DELIVERY_DATE_PATTERN, {
    message: 'deliveryDateTo must be YYYY-MM-DD',
  })
  deliveryDateTo?: string

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  submittedFrom?: Date

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  submittedTo?: Date

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(ORDER_HISTORY_MAX_SEARCH_LENGTH)
  search?: string

  /** ADMIN only. Ignored for APOTHEKER (forced to authenticated user). */
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsString()
  apothekerId?: string

  @Field(() => Int, {
    nullable: true,
    defaultValue: ORDER_HISTORY_DEFAULT_FIRST,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ORDER_HISTORY_MAX_FIRST)
  first?: number

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  after?: string
}
