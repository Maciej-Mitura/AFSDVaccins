import { Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'

import {
  VaccineImageAnalysisInput,
  VaccineImageAnalysisProvider,
  VaccineImageAnalysisResult,
} from './vaccine-image-analysis.provider'
import { VaccineImageAiProvider } from './vaccine-image-ai-provider.enum'

/**
 * Deterministic in-memory analysis provider for tests and local architecture
 * validation. Does not call Azure.
 */
@Injectable()
export class FakeVaccineImageAnalysisProvider
  implements VaccineImageAnalysisProvider
{
  analyse(
    input: VaccineImageAnalysisInput,
  ): Promise<VaccineImageAnalysisResult> {
    const digest = createHash('sha256').update(input.bytes).digest('hex')
    const confidence = Number(
      ((parseInt(digest.slice(0, 4), 16) % 1000) / 1000).toFixed(3),
    )

    return Promise.resolve({
      provider: VaccineImageAiProvider.FAKE,
      caption: `fake-caption:${input.filename}`,
      captionConfidence: confidence,
      tags: ['fake', input.mimeType, `${input.width}x${input.height}`],
      detectedObjects: ['vaccine-vial'],
      detectedText: [`OCR:${digest.slice(0, 8)}`],
      rawEvidenceSummary: `fake-evidence:${digest.slice(0, 16)}`,
      analysedAt: new Date('2026-07-25T12:00:00.000Z'),
    })
  }
}
