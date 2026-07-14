import { Field, InputType, Int } from '@nestjs/graphql'
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator'

import { MAX_DOSE_CAP } from '../settings.constants'

@InputType()
export class UpdateApplicationSettingsInput {
  @Field({ nullable: true })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'orderingClosingTime must use HH:mm format',
  })
  orderingClosingTime?: string

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  weeklyWarningPercentage?: number

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_DOSE_CAP)
  weeklyDoseCap?: number

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_DOSE_CAP)
  dailyDoseCapPerType?: number
}
