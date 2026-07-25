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
 * Provider-neutral analysis result. Must not include Azure SDK types or
 * unbounded raw provider payloads.
 */
export type VaccineImageAnalysisResult = {
  provider: VaccineImageAiProvider
  caption?: string | null
  captionConfidence?: number | null
  tags: string[]
  detectedObjects: string[]
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
