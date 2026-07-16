import { Field, InputType } from '@nestjs/graphql'
import { Transform, Type } from 'class-transformer'
import {
  IsNotEmpty,
  IsOptional,
  MaxLength,
  ValidateNested,
} from 'class-validator'

import { AddressInput } from '../../address.type'

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value

@InputType()
export class CompleteApothekerProfileInput {
  @Field()
  @Transform(trimString)
  @IsNotEmpty()
  @MaxLength(120)
  pharmacyName!: string

  @Field(() => AddressInput)
  @ValidateNested()
  @Type(() => AddressInput)
  address!: AddressInput
}

@InputType()
export class UpdateOwnApothekerProfileInput {
  @Field({ nullable: true })
  @Transform(trimString)
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(120)
  pharmacyName?: string

  @Field(() => AddressInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressInput)
  address?: AddressInput
}
