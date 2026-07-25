import { Injectable } from '@nestjs/common'

import {
  VaccineImageAnalysisInput,
  VaccineImageAnalysisProvider,
  VaccineImageAnalysisResult,
} from './vaccine-image-analysis.provider'

/**
 * Production-selected Azure analysis placeholder (Phase 25C+).
 * Selected when VACCINE_IMAGE_ANALYSIS_PROVIDER=azure; does not call Azure yet.
 */
@Injectable()
export class UnimplementedAzureVaccineImageAnalysisProvider
  implements VaccineImageAnalysisProvider
{
  analyse(
    input: VaccineImageAnalysisInput,
  ): Promise<VaccineImageAnalysisResult> {
    void input
    return Promise.reject(
      new Error(
        'Azure Vision Image Analysis provider is not implemented yet (Phase 25C+)',
      ),
    )
  }
}
