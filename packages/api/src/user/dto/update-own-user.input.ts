import { Field, InputType } from '@nestjs/graphql'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

@InputType()
export class UpdateOwnUserInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string

  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string
}
