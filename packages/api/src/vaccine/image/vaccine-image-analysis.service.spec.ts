import { Test, TestingModule } from '@nestjs/testing'

import { VaccineImageAnalysisTimeoutException } from './vaccine-image-analysis.exceptions'
import {
  VACCINE_IMAGE_ANALYSIS_PROVIDER,
  VaccineImageAnalysisProvider,
} from './vaccine-image-analysis.provider'
import { VaccineImageAnalysisService } from './vaccine-image-analysis.service'
import { VaccineImageAiProvider } from './vaccine-image-ai-provider.enum'
import { VaccineImageValidationStatus } from './vaccine-image-validation-status.enum'

describe('VaccineImageAnalysisService', () => {
  const input = {
    bytes: Buffer.from('validated-bytes'),
    mimeType: 'image/png',
    filename: 'vial.png',
    width: 200,
    height: 200,
  }

  it('returns analysis and classification on success', async () => {
    const analysisProvider: VaccineImageAnalysisProvider = {
      analyse: jest.fn().mockResolvedValue({
        provider: VaccineImageAiProvider.FAKE,
        caption: 'A vaccine vial',
        captionConfidence: 0.9,
        tags: [{ name: 'vaccine', confidence: 0.95 }],
        detectedObjects: [],
        detectedText: [],
        rawEvidenceSummary: 'ok',
        analysedAt: new Date('2026-07-25T12:00:00.000Z'),
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaccineImageAnalysisService,
        {
          provide: VACCINE_IMAGE_ANALYSIS_PROVIDER,
          useValue: analysisProvider,
        },
      ],
    }).compile()

    const service = module.get(VaccineImageAnalysisService)
    const result = await service.analyseAndClassify(input)

    expect(result.analysis?.provider).toBe(VaccineImageAiProvider.FAKE)
    expect(result.classification.status).toBe(
      VaccineImageValidationStatus.ACCEPTED,
    )
    expect(result.errorCode).toBeUndefined()
  })

  it('maps provider failure to ANALYSIS_FAILED without leaking details', async () => {
    const analysisProvider: VaccineImageAnalysisProvider = {
      analyse: jest
        .fn()
        .mockRejectedValue(new VaccineImageAnalysisTimeoutException()),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaccineImageAnalysisService,
        {
          provide: VACCINE_IMAGE_ANALYSIS_PROVIDER,
          useValue: analysisProvider,
        },
      ],
    }).compile()

    const service = module.get(VaccineImageAnalysisService)
    const result = await service.analyseAndClassify(input)

    expect(result.analysis).toBeNull()
    expect(result.classification.status).toBe(
      VaccineImageValidationStatus.ANALYSIS_FAILED,
    )
    expect(result.errorCode).toBe('VACCINE_IMAGE_ANALYSIS_TIMEOUT')
    expect(JSON.stringify(result)).not.toContain('validated-bytes')
  })
})
