import { Field, InputType } from '@nestjs/graphql'
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator'

import { SelfRegistrationRole } from '../self-registration-role.enum'

@InputType()
export class CreateOwnUserInput {
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

  @Field(() => SelfRegistrationRole)
  @IsEnum(SelfRegistrationRole)
  role!: SelfRegistrationRole
}
