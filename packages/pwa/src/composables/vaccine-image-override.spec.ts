/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { VACCINE_IMAGE_OVERRIDE_REASON_MAX_LENGTH } from '@/api/vaccine-image-rest'
import { validateVaccineImageOverrideForm } from '@/composables/vaccine-image-override'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

describe('validateVaccineImageOverrideForm', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('requires an explicit decision', () => {
    const result = validateVaccineImageOverrideForm({
      decision: undefined,
      reason: 'Looks fine',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toBe(
        translate('validation.image.overrideDecision.required'),
      )
    }
  })

  it('requires a non-empty reason', () => {
    const result = validateVaccineImageOverrideForm({
      decision: 'ACCEPTED',
      reason: '   ',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toBe(
        translate('validation.image.overrideReason.required'),
      )
    }
  })

  it('limits reason to 500 characters', () => {
    expect(VACCINE_IMAGE_OVERRIDE_REASON_MAX_LENGTH).toBe(500)
    const result = validateVaccineImageOverrideForm({
      decision: 'REJECTED',
      reason: 'a'.repeat(VACCINE_IMAGE_OVERRIDE_REASON_MAX_LENGTH + 1),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toBe(
        translate('validation.image.overrideReason.maxLength'),
      )
    }
  })

  it('accepts a valid decision and reason', () => {
    const result = validateVaccineImageOverrideForm({
      decision: 'ACCEPTED',
      reason: ' Packaging matches catalogue ',
    })
    expect(result).toEqual({
      ok: true,
      decision: 'ACCEPTED',
      reason: 'Packaging matches catalogue',
    })
  })
})
