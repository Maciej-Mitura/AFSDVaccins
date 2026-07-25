import { VaccineImageAiProvider } from './vaccine-image-ai-provider.enum'

export const VACCINE_IMAGE_ANALYSIS_PROVIDER = Symbol(
  'VACCINE_IMAGE_ANALYSIS_PROVIDER',
)

export type VaccineImageAnalysisInput = {
  bytes: Buffer
  mimeType: string
  filename: string
  width: number
  height: number
}

/**
 * Scored label from analysis (tag or detected object).
 * Confidence is always clamped to [0, 1].
 */
export type VaccineImageAnalysisLabel = {
  name: string
  confidence: number
}

/**
 * Provider-neutral analysis result. Must not include Azure SDK types or
 * unbounded raw provider payloads.
 *
 * Tags/objects carry confidence so the classification policy can score
 * evidence without depending on Azure-specific response shapes.
 */
export type VaccineImageAnalysisResult = {
  provider: VaccineImageAiProvider
  caption?: string | null
  captionConfidence?: number | null
  tags: VaccineImageAnalysisLabel[]
  detectedObjects: VaccineImageAnalysisLabel[]
  detectedText: string[]
  /** Bounded, safe summary for audit — never a full raw Azure body. */
  rawEvidenceSummary?: string | null
  analysedAt: Date
}

export interface VaccineImageAnalysisProvider {
  analyse(
    input: VaccineImageAnalysisInput,
  ): Promise<VaccineImageAnalysisResult>
}

/** Persistence/GraphQL helpers: tag names only (confidence stays in analysis). */
export function analysisLabelNames(
  labels: VaccineImageAnalysisLabel[],
): string[] {
  return labels.map((label) => label.name)
}
