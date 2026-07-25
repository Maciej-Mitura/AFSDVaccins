import {
  VACCINE_IMAGE_OVERRIDE_REASON_MAX_LENGTH,
  type VaccineImageOverrideDecision,
} from '@/api/vaccine-image-rest'
import { translate } from '@/i18n/translate'

export type OverrideReasonValidation =
  | { ok: true; reason: string; decision: VaccineImageOverrideDecision }
  | { ok: false; message: string }

/**
 * Client-side override form checks. Backend remains authoritative.
 */
export function validateVaccineImageOverrideForm(input: {
  decision: VaccineImageOverrideDecision | undefined
  reason: string
}): OverrideReasonValidation {
  if (!input.decision) {
    return {
      ok: false,
      message: translate('validation.image.overrideDecision.required'),
    }
  }

  const reason = input.reason.trim()
  if (reason.length === 0) {
    return {
      ok: false,
      message: translate('validation.image.overrideReason.required'),
    }
  }

  if (input.reason.length > VACCINE_IMAGE_OVERRIDE_REASON_MAX_LENGTH) {
    return {
      ok: false,
      message: translate('validation.image.overrideReason.maxLength'),
    }
  }

  return { ok: true, reason, decision: input.decision }
}
