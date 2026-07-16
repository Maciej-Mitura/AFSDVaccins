import { Field, InputType } from '@nestjs/graphql'
import { Transform } from 'class-transformer'
import { IsNotEmpty, IsOptional, MaxLength } from 'class-validator'

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value

@InputType()
export class CompleteBezorgerProfileInput {
  @Field()
  @Transform(trimString)
  @IsNotEmpty()
  @MaxLength(120)
  displayName!: string

  @Field(() => String, { nullable: true })
  @Transform(trimString)
  @IsOptional()
  @MaxLength(120)
  vehicleLabel?: string | null
}

@InputType()
export class UpdateOwnBezorgerProfileInput {
  @Field({ nullable: true })
  @Transform(trimString)
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(120)
  displayName?: string

  @Field(() => String, { nullable: true })
  @Transform(trimString)
  @IsOptional()
  @MaxLength(120)
  vehicleLabel?: string | null
}
