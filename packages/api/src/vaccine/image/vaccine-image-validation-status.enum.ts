import { registerEnumType } from '@nestjs/graphql'

export enum VaccineImageValidationStatus {
  PENDING_ANALYSIS = 'PENDING_ANALYSIS',
  ACCEPTED = 'ACCEPTED',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
  REJECTED = 'REJECTED',
  ANALYSIS_FAILED = 'ANALYSIS_FAILED',
}

registerEnumType(VaccineImageValidationStatus, {
  name: 'VaccineImageValidationStatus',
  description: 'AI / admin validation state of a vaccine catalogue image',
})
