import { VaccineImageValidationStatus } from './vaccine-image-validation-status.enum'

/**
 * Catalogue / browse visibility for a vaccine image.
 *
 * - ACCEPTED: browseable (normal catalogue display)
 * - REVIEW_REQUIRED: browseable (explicit — still shown pending admin AI review)
 * - REJECTED: not browseable
 * - PENDING_ANALYSIS / ANALYSIS_FAILED: not browseable until accepted or review
 */
export function isVaccineImageBrowseable(
  status: VaccineImageValidationStatus,
): boolean {
  return (
    status === VaccineImageValidationStatus.ACCEPTED ||
    status === VaccineImageValidationStatus.REVIEW_REQUIRED
  )
}
