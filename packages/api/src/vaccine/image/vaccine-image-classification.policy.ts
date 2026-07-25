import { VaccineImageValidationStatus } from './vaccine-image-validation-status.enum'
import {
  VACCINE_IMAGE_ANALYSIS_MAX_MATCHED_EVIDENCE,
  VACCINE_IMAGE_ANALYSIS_MAX_MATCHED_TERMS,
  VACCINE_IMAGE_ANALYSIS_MAX_REASON_LENGTH,
  clampUnitInterval,
  truncateText,
} from './vaccine-image-analysis.bounds'
import { VaccineImageAnalysisResult } from './vaccine-image-analysis.provider'

/**
 * Provider-neutral vaccine image classification policy.
 *
 * Azure (or fake) analysis returns evidence only. This classifier decides status.
 * It is not a medical authority and must never auto-override admin decisions.
 *
 * ## Scoring formula
 *
 * 1. Normalize all label names, caption, and OCR lines to lowercase.
 * 2. Collect matches against:
 *    - Strong vaccine terms (weighted highest)
 *    - Medical / pharmaceutical product terms
 * 3. Per matched term, take the maximum contributing confidence across sources:
 *    - tag / object confidence as returned by analysis
 *    - caption match → captionConfidence (or 0.5 if missing)
 *    - OCR match → fixed OCR_TEXT_CONFIDENCE (0.80)
 * 4. Derive:
 *    - strongScore = max confidence among strong-term matches (else 0)
 *    - medicalScore = min(1, average of top-N distinct medical-term confidences)
 *      where N = MEDICAL_SCORE_TOP_N (3)
 *    - vaccineTextPresent = caption or OCR contains any strong vaccine term
 * 5. Combined explainable score in [0, 1]:
 *      score = clamp(
 *        STRONG_WEIGHT * strongScore
 *        + MEDICAL_WEIGHT * medicalScore
 *        + TEXT_WEIGHT * (vaccineTextPresent ? 1 : 0)
 *      )
 *
 * ## Decision thresholds
 *
 * ACCEPTED when:
 *   - strongScore >= STRONG_ACCEPT_MIN (0.60), OR
 *   - medicalDistinctCount >= MEDICAL_ACCEPT_MIN_SIGNALS (2)
 *     AND vaccineTextPresent
 *     AND score >= COMBINED_ACCEPT_MIN (0.55)
 *
 * REVIEW_REQUIRED when not ACCEPTED and:
 *   - medicalDistinctCount >= 1, OR
 *   - medicalScore >= MEDICAL_REVIEW_MIN (0.25), OR
 *   - strongScore >= STRONG_REVIEW_MIN (0.30)
 *
 * REJECTED when none of the above (no meaningful medical evidence).
 *
 * ANALYSIS_FAILED is produced by the application service on provider failure,
 * not by this pure function (unless analysis evidence is unusable).
 */

export const STRONG_VACCINE_TERMS = [
  'vaccine',
  'vaccination',
  'immunization',
  'immunisation',
] as const

export const MEDICAL_PRODUCT_TERMS = [
  'medicine',
  'medical',
  'pharmaceutical',
  'drug',
  'vial',
  'syringe',
  'ampoule',
  'injection',
  'bottle',
  'medication',
  'packaging',
  'box',
] as const

/** Weights for the combined explainable score (must sum to 1). */
export const CLASSIFIER_STRONG_WEIGHT = 0.55
export const CLASSIFIER_MEDICAL_WEIGHT = 0.3
export const CLASSIFIER_TEXT_WEIGHT = 0.15

export const OCR_TEXT_CONFIDENCE = 0.8
export const CAPTION_FALLBACK_CONFIDENCE = 0.5
export const MEDICAL_SCORE_TOP_N = 3

export const STRONG_ACCEPT_MIN = 0.6
export const COMBINED_ACCEPT_MIN = 0.55
export const MEDICAL_ACCEPT_MIN_SIGNALS = 2
export const MEDICAL_REVIEW_MIN = 0.25
export const STRONG_REVIEW_MIN = 0.3

export type VaccineImageClassificationDecision = {
  status:
    | VaccineImageValidationStatus.ACCEPTED
    | VaccineImageValidationStatus.REVIEW_REQUIRED
    | VaccineImageValidationStatus.REJECTED
    | VaccineImageValidationStatus.ANALYSIS_FAILED
  /** Explainable score in [0, 1]. */
  score: number
  reason: string
  matchedEvidence: string[]
  matchedTerms: string[]
}

export function classifyVaccineImageAnalysis(
  analysis: VaccineImageAnalysisResult,
): VaccineImageClassificationDecision {
  const strongMatches = new Map<string, number>()
  const medicalMatches = new Map<string, number>()
  const matchedEvidence: string[] = []

  const considerLabel = (
    source: string,
    name: string,
    confidence: number,
  ): void => {
    const normalized = name.toLowerCase()
    const clamped = clampUnitInterval(confidence)
    recordTermMatches(
      normalized,
      clamped,
      strongMatches,
      medicalMatches,
      matchedEvidence,
      `${source}:${truncateText(name, 64)}@${clamped.toFixed(2)}`,
    )
  }

  for (const tag of analysis.tags) {
    considerLabel('tag', tag.name, tag.confidence)
  }
  for (const object of analysis.detectedObjects) {
    considerLabel('object', object.name, object.confidence)
  }

  if (typeof analysis.caption === 'string' && analysis.caption.trim().length > 0) {
    const captionConfidence =
      typeof analysis.captionConfidence === 'number'
        ? clampUnitInterval(analysis.captionConfidence)
        : CAPTION_FALLBACK_CONFIDENCE
    recordTermMatches(
      analysis.caption.toLowerCase(),
      captionConfidence,
      strongMatches,
      medicalMatches,
      matchedEvidence,
      `caption:${truncateText(analysis.caption, 80)}@${captionConfidence.toFixed(2)}`,
    )
  }

  for (const line of analysis.detectedText) {
    recordTermMatches(
      line.toLowerCase(),
      OCR_TEXT_CONFIDENCE,
      strongMatches,
      medicalMatches,
      matchedEvidence,
      `ocr:${truncateText(line, 80)}@${OCR_TEXT_CONFIDENCE.toFixed(2)}`,
    )
  }

  const strongScore = maxMapValue(strongMatches)
  const medicalConfidences = [...medicalMatches.values()].sort((a, b) => b - a)
  const topMedical = medicalConfidences.slice(0, MEDICAL_SCORE_TOP_N)
  const medicalScore =
    topMedical.length === 0
      ? 0
      : clampUnitInterval(
          topMedical.reduce((sum, value) => sum + value, 0) / MEDICAL_SCORE_TOP_N,
        )
  const medicalDistinctCount = medicalMatches.size

  const vaccineTextPresent = textContainsAnyTerm(
    [
      analysis.caption ?? '',
      ...analysis.detectedText,
    ]
      .join(' ')
      .toLowerCase(),
    STRONG_VACCINE_TERMS,
  )

  const score = clampUnitInterval(
    CLASSIFIER_STRONG_WEIGHT * strongScore +
      CLASSIFIER_MEDICAL_WEIGHT * medicalScore +
      CLASSIFIER_TEXT_WEIGHT * (vaccineTextPresent ? 1 : 0),
  )

  const matchedTerms = boundUniqueTerms([
    ...strongMatches.keys(),
    ...medicalMatches.keys(),
  ])

  const evidence = matchedEvidence.slice(
    0,
    VACCINE_IMAGE_ANALYSIS_MAX_MATCHED_EVIDENCE,
  )

  if (
    strongScore >= STRONG_ACCEPT_MIN ||
    (medicalDistinctCount >= MEDICAL_ACCEPT_MIN_SIGNALS &&
      vaccineTextPresent &&
      score >= COMBINED_ACCEPT_MIN)
  ) {
    return {
      status: VaccineImageValidationStatus.ACCEPTED,
      score,
      reason: truncateText(
        strongScore >= STRONG_ACCEPT_MIN
          ? 'Strong vaccine evidence at sufficient confidence'
          : 'Multiple medical-product signals plus vaccine-related text evidence',
        VACCINE_IMAGE_ANALYSIS_MAX_REASON_LENGTH,
      ),
      matchedEvidence: evidence,
      matchedTerms,
    }
  }

  if (
    medicalDistinctCount >= 1 ||
    medicalScore >= MEDICAL_REVIEW_MIN ||
    strongScore >= STRONG_REVIEW_MIN
  ) {
    return {
      status: VaccineImageValidationStatus.REVIEW_REQUIRED,
      score,
      reason: truncateText(
        'Plausible medical or pharmaceutical image with insufficient direct vaccine evidence',
        VACCINE_IMAGE_ANALYSIS_MAX_REASON_LENGTH,
      ),
      matchedEvidence: evidence,
      matchedTerms,
    }
  }

  return {
    status: VaccineImageValidationStatus.REJECTED,
    score,
    reason: truncateText(
      'No meaningful medical or vaccine evidence detected',
      VACCINE_IMAGE_ANALYSIS_MAX_REASON_LENGTH,
    ),
    matchedEvidence: evidence,
    matchedTerms,
  }
}

export function analysisFailedDecision(
  reason = 'Image analysis provider failed or response could not be safely interpreted',
): VaccineImageClassificationDecision {
  return {
    status: VaccineImageValidationStatus.ANALYSIS_FAILED,
    score: 0,
    reason: truncateText(reason, VACCINE_IMAGE_ANALYSIS_MAX_REASON_LENGTH),
    matchedEvidence: [],
    matchedTerms: [],
  }
}

function recordTermMatches(
  haystack: string,
  confidence: number,
  strongMatches: Map<string, number>,
  medicalMatches: Map<string, number>,
  matchedEvidence: string[],
  evidenceLine: string,
): void {
  let matched = false
  for (const term of STRONG_VACCINE_TERMS) {
    if (containsTerm(haystack, term)) {
      matched = true
      const previous = strongMatches.get(term) ?? 0
      if (confidence > previous) {
        strongMatches.set(term, confidence)
      }
    }
  }
  for (const term of MEDICAL_PRODUCT_TERMS) {
    if (containsTerm(haystack, term)) {
      matched = true
      const previous = medicalMatches.get(term) ?? 0
      if (confidence > previous) {
        medicalMatches.set(term, confidence)
      }
    }
  }
  if (
    matched &&
    matchedEvidence.length < VACCINE_IMAGE_ANALYSIS_MAX_MATCHED_EVIDENCE
  ) {
    matchedEvidence.push(evidenceLine)
  }
}

function containsTerm(haystack: string, term: string): boolean {
  return haystack.includes(term)
}

function textContainsAnyTerm(
  haystack: string,
  terms: readonly string[],
): boolean {
  return terms.some((term) => containsTerm(haystack, term))
}

function maxMapValue(map: Map<string, number>): number {
  let max = 0
  for (const value of map.values()) {
    if (value > max) {
      max = value
    }
  }
  return clampUnitInterval(max)
}

function boundUniqueTerms(terms: string[]): string[] {
  const unique: string[] = []
  const seen = new Set<string>()
  for (const term of terms) {
    if (seen.has(term)) {
      continue
    }
    seen.add(term)
    unique.push(term)
    if (unique.length >= VACCINE_IMAGE_ANALYSIS_MAX_MATCHED_TERMS) {
      break
    }
  }
  return unique
}
