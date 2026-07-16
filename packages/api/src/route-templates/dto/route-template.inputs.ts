import { Field, ID, InputType } from '@nestjs/graphql'
import { Transform, Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  ValidateNested,
} from 'class-validator'

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value

@InputType()
export class RouteTemplateStopInput {
  @Field(() => ID)
  @IsNotEmpty()
  apothekerProfileId!: string
}

@InputType()
export class CreateRouteTemplateInput {
  @Field()
  @Transform(trimString)
  @IsNotEmpty()
  @MaxLength(120)
  name!: string

  @Field(() => String, { nullable: true })
  @Transform(trimString)
  @IsOptional()
  @MaxLength(500)
  description?: string | null

  @Field(() => ID)
  @IsNotEmpty()
  bezorgerProfileId!: string

  @Field(() => [RouteTemplateStopInput])
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RouteTemplateStopInput)
  stops!: RouteTemplateStopInput[]
}

@InputType()
export class UpdateRouteTemplateInput {
  @Field({ nullable: true })
  @Transform(trimString)
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string

  @Field(() => String, { nullable: true })
  @Transform(trimString)
  @IsOptional()
  @MaxLength(500)
  description?: string | null

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsNotEmpty()
  bezorgerProfileId?: string

  @Field(() => [RouteTemplateStopInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RouteTemplateStopInput)
  stops?: RouteTemplateStopInput[]
}
