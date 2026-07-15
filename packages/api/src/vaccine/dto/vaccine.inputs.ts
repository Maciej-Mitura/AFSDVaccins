import { Field, InputType, Int } from '@nestjs/graphql'
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  Min,
} from 'class-validator'
import { Transform } from 'class-transformer'

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value

@InputType()
export class CreateVaccineInput {
  @Field()
  @Transform(trimString)
  @IsNotEmpty()
  @MaxLength(120)
  name!: string

  @Field({ defaultValue: '' })
  @Transform(trimString)
  @IsOptional()
  @MaxLength(500)
  description?: string

  @Field()
  @Transform(trimString)
  @IsNotEmpty()
  @MaxLength(120)
  manufacturer!: string

  @Field(() => Int, { defaultValue: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  stockWarningThreshold?: number

  @Field({ defaultValue: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean
}

@InputType()
export class UpdateVaccineInput {
  @Field({ nullable: true })
  @Transform(trimString)
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string

  @Field({ nullable: true })
  @Transform(trimString)
  @IsOptional()
  @MaxLength(500)
  description?: string

  @Field({ nullable: true })
  @Transform(trimString)
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(120)
  manufacturer?: string

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  stockWarningThreshold?: number

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean
}
