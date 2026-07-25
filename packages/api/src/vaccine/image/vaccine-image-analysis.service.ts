import { Inject, Injectable } from '@nestjs/common'

import {
  analysisFailedDecision,
  classifyVaccineImageAnalysis,
  VaccineImageClassificationDecision,
} from './vaccine-image-classification.policy'
import {
  isVaccineImageAnalysisDomainException,
  vaccineImageAnalysisErrorCode,
  VaccineImageAnalysisConfigurationException,
} from './vaccine-image-analysis.exceptions'
import {
  VACCINE_IMAGE_ANALYSIS_PROVIDER,
  VaccineImageAnalysisInput,
  VaccineImageAnalysisResult,
} from './vaccine-image-analysis.provider'
import type { VaccineImageAnalysisProvider } from './vaccine-image-analysis.provider'
import { VaccineImageAiProvider } from './vaccine-image-ai-provider.enum'

/**
 * Application orchestration for Phase 25E upload flow.
 *
 * Runs provider-neutral analysis then classification. Does not persist Vaccine
 * metadata and does not upload binary storage.
 *
 * Rate limiting / cost control (Phase 25E upload endpoint MUST enforce):
 * - Use a stricter @Throttle than the default GraphQL budget for multipart upload.
 * - Provider already enforces timeout and does not auto-retry.
 * - Do not call Azure Vision during application startup.
 */
export type VaccineImageAnalyseAndClassifyResult = {
  analysis: VaccineImageAnalysisResult | null
  classification: VaccineImageClassificationDecision
  /** Safe domain error code when classification is ANALYSIS_FAILED. */
  errorCode?: string
}

@Injectable()
export class VaccineImageAnalysisService {
  constructor(
    @Inject(VACCINE_IMAGE_ANALYSIS_PROVIDER)
    private readonly analysisProvider: VaccineImageAnalysisProvider,
  ) {}

  /**
   * Analyse validated image bytes and classify evidence.
   * Provider failures become ANALYSIS_FAILED (not thrown), except configuration
   * errors which indicate a programming / env mistake.
   */
  async analyseAndClassify(
    input: VaccineImageAnalysisInput,
  ): Promise<VaccineImageAnalyseAndClassifyResult> {
    try {
      const analysis = await this.analysisProvider.analyse(input)
      const classification = classifyVaccineImageAnalysis(analysis)
      return { analysis, classification }
    } catch (error) {
      if (error instanceof VaccineImageAnalysisConfigurationException) {
        throw error
      }

      const errorCode = isVaccineImageAnalysisDomainException(error)
        ? vaccineImageAnalysisErrorCode(error)
        : 'VACCINE_IMAGE_ANALYSIS_PROVIDER_FAILED'

      return {
        analysis: null,
        classification: analysisFailedDecision(
          'Image analysis provider failed or response could not be safely interpreted',
        ),
        errorCode,
      }
    }
  }
}

/** Empty failed analysis placeholder for callers that need a result shape. */
export function emptyFailedAnalysis(
  provider: VaccineImageAiProvider,
  analysedAt: Date = new Date(),
): VaccineImageAnalysisResult {
  return {
    provider,
    caption: null,
    captionConfidence: null,
    tags: [],
    detectedObjects: [],
    detectedText: [],
    rawEvidenceSummary: 'analysis-failed',
    analysedAt,
  }
}
