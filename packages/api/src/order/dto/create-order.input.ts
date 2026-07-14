import { Field, InputType } from '@nestjs/graphql'
import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator'

import { CreateOrderLineInput } from './create-order-line.input'

@InputType()
export class CreateOrderInput {
  @Field(() => [CreateOrderLineInput])
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderLineInput)
  lines!: CreateOrderLineInput[]
}
