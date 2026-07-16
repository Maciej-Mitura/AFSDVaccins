import { Field, InputType, ObjectType } from '@nestjs/graphql'
import { Transform } from 'class-transformer'
import {
  IsNotEmpty,
  IsOptional,
  Matches,
  MaxLength,
} from 'class-validator'

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value

@ObjectType('Address')
export class Address {
  @Field()
  street!: string

  @Field()
  houseNumber!: string

  @Field()
  postalCode!: string

  @Field()
  city!: string

  @Field()
  country!: string
}

@InputType('AddressInput')
export class AddressInput {
  @Field()
  @Transform(trimString)
  @IsNotEmpty()
  @MaxLength(120)
  street!: string

  @Field()
  @Transform(trimString)
  @IsNotEmpty()
  @MaxLength(20)
  houseNumber!: string

  @Field()
  @Transform(trimString)
  @IsNotEmpty()
  @Matches(/^\d{4}$/, {
    message: 'postalCode must be a 4-digit Belgian postal code',
  })
  postalCode!: string

  @Field()
  @Transform(trimString)
  @IsNotEmpty()
  @MaxLength(100)
  city!: string

  @Field({ nullable: true, defaultValue: 'BE' })
  @Transform(trimString)
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(2)
  @Matches(/^[A-Za-z]{2}$/, {
    message: 'country must be a 2-letter ISO country code',
  })
  country?: string
}

export function normalizeAddress(input: AddressInput): Address {
  const countryRaw = input.country?.trim()
  const country =
    countryRaw && countryRaw.length > 0
      ? countryRaw.toUpperCase()
      : 'BE'

  return {
    street: input.street.trim(),
    houseNumber: input.houseNumber.trim(),
    postalCode: input.postalCode.trim(),
    city: input.city.trim(),
    country,
  }
}
