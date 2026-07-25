import { registerEnumType } from '@nestjs/graphql'

/** Admin override decision for vaccine image validation. */
export enum VaccineImageOverrideDecision {
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
}

registerEnumType(VaccineImageOverrideDecision, {
  name: 'VaccineImageOverrideDecision',
  description: 'Admin override decision for vaccine image validation',
})
