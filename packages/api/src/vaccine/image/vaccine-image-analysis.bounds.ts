/** Hard bounds so unusual Azure payloads cannot be persisted or logged unboundedly. */

export const VACCINE_IMAGE_ANALYSIS_MAX_TAGS = 32
export const VACCINE_IMAGE_ANALYSIS_MAX_OBJECTS = 32
export const VACCINE_IMAGE_ANALYSIS_MAX_DETECTED_TEXT = 64
export const VACCINE_IMAGE_ANALYSIS_MAX_CAPTION_LENGTH = 512
export const VACCINE_IMAGE_ANALYSIS_MAX_LABEL_NAME_LENGTH = 128
export const VACCINE_IMAGE_ANALYSIS_MAX_TEXT_LINE_LENGTH = 256
export const VACCINE_IMAGE_ANALYSIS_MAX_EVIDENCE_SUMMARY_LENGTH = 512
export const VACCINE_IMAGE_ANALYSIS_MAX_REASON_LENGTH = 280
export const VACCINE_IMAGE_ANALYSIS_MAX_MATCHED_EVIDENCE = 24
export const VACCINE_IMAGE_ANALYSIS_MAX_MATCHED_TERMS = 16

export function clampUnitInterval(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  if (value < 0) {
    return 0
  }
  if (value > 1) {
    return 1
  }
  return value
}

export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }
  return value.slice(0, maxLength)
}

export function boundStringArray(
  values: string[],
  maxItems: number,
  maxItemLength: number,
): string[] {
  const bounded: string[] = []
  for (const value of values) {
    if (bounded.length >= maxItems) {
      break
    }
    if (typeof value !== 'string') {
      continue
    }
    const trimmed = value.trim()
    if (trimmed.length === 0) {
      continue
    }
    bounded.push(truncateText(trimmed, maxItemLength))
  }
  return bounded
}
