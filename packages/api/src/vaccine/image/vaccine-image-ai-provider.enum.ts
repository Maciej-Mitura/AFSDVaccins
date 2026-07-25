import { registerEnumType } from '@nestjs/graphql'

/**
 * Persisted AI analysis provider identifiers.
 * AZURE_VISION_4 is the production target (replaceable behind the analysis interface).
 * FAKE is for explicit non-production test/local providers only.
 */
export enum VaccineImageAiProvider {
  AZURE_VISION_4 = 'AZURE_VISION_4',
  FAKE = 'FAKE',
}

registerEnumType(VaccineImageAiProvider, {
  name: 'VaccineImageAiProvider',
  description: 'Provider that analysed a vaccine image',
})
