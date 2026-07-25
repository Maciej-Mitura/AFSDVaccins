import {
  classifyVaccineImageAnalysis,
  analysisFailedDecision,
} from './vaccine-image-classification.policy'
import { VaccineImageAiProvider } from './vaccine-image-ai-provider.enum'
import { VaccineImageAnalysisResult } from './vaccine-image-analysis.provider'
import { VaccineImageValidationStatus } from './vaccine-image-validation-status.enum'

function baseAnalysis(
  overrides: Partial<VaccineImageAnalysisResult> = {},
): VaccineImageAnalysisResult {
  return {
    provider: VaccineImageAiProvider.AZURE_VISION_4,
    caption: null,
    captionConfidence: null,
    tags: [],
    detectedObjects: [],
    detectedText: [],
    rawEvidenceSummary: 'test',
    analysedAt: new Date('2026-07-25T12:00:00.000Z'),
    ...overrides,
  }
}

describe('classifyVaccineImageAnalysis', () => {
  it('accepts strong vaccine evidence', () => {
    const decision = classifyVaccineImageAnalysis(
      baseAnalysis({
        tags: [{ name: 'vaccine', confidence: 0.92 }],
        caption: 'A vaccine vial on a table',
        captionConfidence: 0.85,
      }),
    )

    expect(decision.status).toBe(VaccineImageValidationStatus.ACCEPTED)
    expect(decision.score).toBeGreaterThanOrEqual(0)
    expect(decision.score).toBeLessThanOrEqual(1)
    expect(decision.matchedTerms).toEqual(expect.arrayContaining(['vaccine']))
    expect(decision.reason.toLowerCase()).toContain('vaccine')
  })

  it('accepts multiple medical signals plus vaccine-related OCR/caption', () => {
    const decision = classifyVaccineImageAnalysis(
      baseAnalysis({
        tags: [
          { name: 'syringe', confidence: 0.7 },
          { name: 'vial', confidence: 0.65 },
        ],
        detectedText: ['Seasonal vaccination pack'],
      }),
    )

    expect(decision.status).toBe(VaccineImageValidationStatus.ACCEPTED)
    expect(decision.score).toBeGreaterThanOrEqual(0)
    expect(decision.score).toBeLessThanOrEqual(1)
  })

  it('requires review for ambiguous medical evidence', () => {
    const decision = classifyVaccineImageAnalysis(
      baseAnalysis({
        tags: [
          { name: 'bottle', confidence: 0.7 },
          { name: 'medicine', confidence: 0.6 },
        ],
        caption: 'Pharmaceutical packaging on a shelf',
        captionConfidence: 0.55,
      }),
    )

    expect(decision.status).toBe(VaccineImageValidationStatus.REVIEW_REQUIRED)
    expect(decision.score).toBeGreaterThanOrEqual(0)
    expect(decision.score).toBeLessThanOrEqual(1)
  })

  it('rejects unrelated evidence', () => {
    const decision = classifyVaccineImageAnalysis(
      baseAnalysis({
        tags: [
          { name: 'cat', confidence: 0.95 },
          { name: 'sofa', confidence: 0.8 },
        ],
        caption: 'A cat sitting on a sofa',
        captionConfidence: 0.9,
        detectedText: ['Hello world'],
      }),
    )

    expect(decision.status).toBe(VaccineImageValidationStatus.REJECTED)
    expect(decision.score).toBeGreaterThanOrEqual(0)
    expect(decision.score).toBeLessThanOrEqual(1)
  })

  it('is deterministic for the same analysis input', () => {
    const analysis = baseAnalysis({
      tags: [{ name: 'immunization', confidence: 0.81 }],
      detectedObjects: [{ name: 'syringe', confidence: 0.7 }],
      detectedText: ['Flu vaccine'],
    })

    expect(classifyVaccineImageAnalysis(analysis)).toEqual(
      classifyVaccineImageAnalysis(analysis),
    )
  })

  it('maps provider failure helper to ANALYSIS_FAILED with score 0', () => {
    const decision = analysisFailedDecision()
    expect(decision.status).toBe(VaccineImageValidationStatus.ANALYSIS_FAILED)
    expect(decision.score).toBe(0)
    expect(decision.matchedEvidence).toEqual([])
  })
})
