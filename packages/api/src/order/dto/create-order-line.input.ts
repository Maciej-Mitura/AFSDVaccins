import { Field, ID, InputType, Int } from '@nestjs/graphql'
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator'

@InputType()
export class CreateOrderLineInput {
  @Field(() => ID)
  @IsString()
  @IsNotEmpty()
  vaccineId!: string

  @Field(() => Int)
  @IsInt()
  @Min(1)
  quantity!: number
}
