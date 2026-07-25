import {
  VACCINE_IMAGE_ANALYSIS_MAX_CAPTION_LENGTH,
  VACCINE_IMAGE_ANALYSIS_MAX_DETECTED_TEXT,
  VACCINE_IMAGE_ANALYSIS_MAX_EVIDENCE_SUMMARY_LENGTH,
  VACCINE_IMAGE_ANALYSIS_MAX_LABEL_NAME_LENGTH,
  VACCINE_IMAGE_ANALYSIS_MAX_OBJECTS,
  VACCINE_IMAGE_ANALYSIS_MAX_TAGS,
  VACCINE_IMAGE_ANALYSIS_MAX_TEXT_LINE_LENGTH,
  clampUnitInterval,
  truncateText,
} from './vaccine-image-analysis.bounds'
import { VaccineImageAnalysisMalformedResponseException } from './vaccine-image-analysis.exceptions'
import {
  VaccineImageAnalysisLabel,
  VaccineImageAnalysisResult,
} from './vaccine-image-analysis.provider'
import { VaccineImageAiProvider } from './vaccine-image-ai-provider.enum'

/**
 * Minimal structural view of Azure Image Analysis 4.0 success body.
 * Kept local so Azure SDK types never leak outside the provider.
 */
export type AzureVisionAnalysisBody = {
  captionResult?: {
    text?: string
    confidence?: number
  }
  tagsResult?: {
    values?: Array<{ name?: string; confidence?: number }>
  }
  objectsResult?: {
    values?: Array<{
      tags?: Array<{ name?: string; confidence?: number }>
    }>
  }
  readResult?: {
    blocks?: Array<{
      lines?: Array<{ text?: string }>
    }>
  }
  modelVersion?: string
}

/**
 * Map Azure Vision output into the provider-neutral analysis contract.
 * Bounds all arrays and string lengths. Never returns raw Azure objects.
 */
export function mapAzureVisionAnalysisBody(
  body: unknown,
  analysedAt: Date = new Date(),
): VaccineImageAnalysisResult {
  if (!body || typeof body !== 'object') {
    throw new VaccineImageAnalysisMalformedResponseException()
  }

  const azure = body as AzureVisionAnalysisBody

  const captionText =
    typeof azure.captionResult?.text === 'string'
      ? truncateText(
          azure.captionResult.text.trim(),
          VACCINE_IMAGE_ANALYSIS_MAX_CAPTION_LENGTH,
        )
      : null

  const captionConfidence =
    typeof azure.captionResult?.confidence === 'number'
      ? clampUnitInterval(azure.captionResult.confidence)
      : null

  const tags = boundLabels(
    (azure.tagsResult?.values ?? []).map((tag) => ({
      name: typeof tag?.name === 'string' ? tag.name : '',
      confidence:
        typeof tag?.confidence === 'number' ? tag.confidence : Number.NaN,
    })),
    VACCINE_IMAGE_ANALYSIS_MAX_TAGS,
  )

  const detectedObjects = boundLabels(
    (azure.objectsResult?.values ?? []).map((object) => {
      const best = pickBestObjectTag(object?.tags)
      return {
        name: best?.name ?? '',
        confidence: best?.confidence ?? Number.NaN,
      }
    }),
    VACCINE_IMAGE_ANALYSIS_MAX_OBJECTS,
  )

  const detectedText: string[] = []
  for (const block of azure.readResult?.blocks ?? []) {
    for (const line of block?.lines ?? []) {
      if (detectedText.length >= VACCINE_IMAGE_ANALYSIS_MAX_DETECTED_TEXT) {
        break
      }
      if (typeof line?.text !== 'string') {
        continue
      }
      const trimmed = line.text.trim()
      if (trimmed.length === 0) {
        continue
      }
      detectedText.push(
        truncateText(trimmed, VACCINE_IMAGE_ANALYSIS_MAX_TEXT_LINE_LENGTH),
      )
    }
    if (detectedText.length >= VACCINE_IMAGE_ANALYSIS_MAX_DETECTED_TEXT) {
      break
    }
  }

  const modelHint =
    typeof azure.modelVersion === 'string' && azure.modelVersion.length > 0
      ? truncateText(azure.modelVersion, 64)
      : 'unknown'

  const rawEvidenceSummary = truncateText(
    `azure-vision-4 caption=${captionText ? 'yes' : 'no'} tags=${tags.length} objects=${detectedObjects.length} ocr=${detectedText.length} model=${modelHint}`,
    VACCINE_IMAGE_ANALYSIS_MAX_EVIDENCE_SUMMARY_LENGTH,
  )

  return {
    provider: VaccineImageAiProvider.AZURE_VISION_4,
    caption: captionText && captionText.length > 0 ? captionText : null,
    captionConfidence,
    tags,
    detectedObjects,
    detectedText,
    rawEvidenceSummary,
    analysedAt,
  }
}

function pickBestObjectTag(
  tags: Array<{ name?: string; confidence?: number }> | undefined,
): { name: string; confidence: number } | null {
  if (!Array.isArray(tags) || tags.length === 0) {
    return null
  }

  let best: { name: string; confidence: number } | null = null
  for (const tag of tags) {
    if (typeof tag?.name !== 'string' || tag.name.trim().length === 0) {
      continue
    }
    const confidence =
      typeof tag.confidence === 'number'
        ? clampUnitInterval(tag.confidence)
        : 0
    if (!best || confidence > best.confidence) {
      best = { name: tag.name.trim(), confidence }
    }
  }
  return best
}

function boundLabels(
  labels: Array<{ name: string; confidence: number }>,
  maxItems: number,
): VaccineImageAnalysisLabel[] {
  const bounded: VaccineImageAnalysisLabel[] = []
  for (const label of labels) {
    if (bounded.length >= maxItems) {
      break
    }
    const name = truncateText(
      label.name.trim(),
      VACCINE_IMAGE_ANALYSIS_MAX_LABEL_NAME_LENGTH,
    )
    if (name.length === 0 || !Number.isFinite(label.confidence)) {
      continue
    }
    bounded.push({
      name,
      confidence: clampUnitInterval(label.confidence),
    })
  }
  return bounded
}
