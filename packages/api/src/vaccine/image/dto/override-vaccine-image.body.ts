import { IsIn, IsString, MaxLength, MinLength } from 'class-validator'

import { VACCINE_IMAGE_OVERRIDE_REASON_MAX_LENGTH } from '../vaccine-image-upload.exceptions'

export class OverrideVaccineImageBodyDto {
  @IsIn(['ACCEPTED', 'REJECTED'])
  decision!: 'ACCEPTED' | 'REJECTED'

  @IsString()
  @MinLength(1)
  @MaxLength(VACCINE_IMAGE_OVERRIDE_REASON_MAX_LENGTH)
  reason!: string
}
