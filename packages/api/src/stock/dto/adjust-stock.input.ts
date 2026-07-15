import { Field, ID, InputType, Int } from '@nestjs/graphql'
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  Min,
} from 'class-validator'
import { Transform } from 'class-transformer'

import { StockAdjustmentType } from '../stock-adjustment-type.enum'

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value

@InputType()
export class AdjustStockInput {
  @Field(() => ID)
  @IsNotEmpty()
  vaccineId!: string

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  quantityDelta?: number

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  targetQuantity?: number

  @Field(() => StockAdjustmentType)
  @IsEnum(StockAdjustmentType)
  type!: StockAdjustmentType

  @Field()
  @Transform(trimString)
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string
}
