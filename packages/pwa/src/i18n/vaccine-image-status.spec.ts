/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  boundVaccineImageTags,
  formatVaccineImageConfidence,
  isVaccineImageBrowseable,
  vaccineImageValidationStatusExplanation,
  vaccineImageValidationStatusLabel,
} from '@/i18n/vaccine-image-status'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'
import { useLanguage } from '@/composables/useLanguage'

describe('vaccine image status labels', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('marks ACCEPTED and REVIEW_REQUIRED as browseable', () => {
    expect(isVaccineImageBrowseable('ACCEPTED')).toBe(true)
    expect(isVaccineImageBrowseable('REVIEW_REQUIRED')).toBe(true)
    expect(isVaccineImageBrowseable('REJECTED')).toBe(false)
    expect(isVaccineImageBrowseable('ANALYSIS_FAILED')).toBe(false)
    expect(isVaccineImageBrowseable('PENDING_ANALYSIS')).toBe(false)
  })

  it('translates status labels and explanations', async () => {
    expect(vaccineImageValidationStatusLabel('ACCEPTED')).toBe(
      translate('vaccines.image.status.accepted'),
    )
    expect(vaccineImageValidationStatusExplanation('REJECTED')).toBe(
      translate('vaccines.image.explanation.rejected'),
    )

    const { setLocale } = useLanguage()
    await setLocale('nl')
    expect(vaccineImageValidationStatusLabel('ACCEPTED')).toBe(
      translate('vaccines.image.status.accepted'),
    )
    expect(vaccineImageValidationStatusLabel('ACCEPTED')).not.toBe('Accepted')
  })

  it('formats confidence as a percentage', () => {
    expect(formatVaccineImageConfidence(0.876)).toBe(
      translate('vaccines.image.confidenceValue', { value: 88 }),
    )
    expect(formatVaccineImageConfidence(null)).toBeNull()
  })

  it('bounds AI tags', () => {
    const tags = Array.from({ length: 12 }, (_, i) => `tag-${i}`)
    expect(boundVaccineImageTags(tags, 8)).toHaveLength(8)
  })
})
