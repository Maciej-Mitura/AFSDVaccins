import { isVaccineImageBrowseable } from './vaccine-image.browseable'
import { VaccineImageValidationStatus } from './vaccine-image-validation-status.enum'

describe('isVaccineImageBrowseable', () => {
  it('treats ACCEPTED and REVIEW_REQUIRED as browseable', () => {
    expect(
      isVaccineImageBrowseable(VaccineImageValidationStatus.ACCEPTED),
    ).toBe(true)
    expect(
      isVaccineImageBrowseable(VaccineImageValidationStatus.REVIEW_REQUIRED),
    ).toBe(true)
  })

  it('does not treat REJECTED, PENDING_ANALYSIS, or ANALYSIS_FAILED as browseable', () => {
    expect(
      isVaccineImageBrowseable(VaccineImageValidationStatus.REJECTED),
    ).toBe(false)
    expect(
      isVaccineImageBrowseable(VaccineImageValidationStatus.PENDING_ANALYSIS),
    ).toBe(false)
    expect(
      isVaccineImageBrowseable(VaccineImageValidationStatus.ANALYSIS_FAILED),
    ).toBe(false)
  })
})
