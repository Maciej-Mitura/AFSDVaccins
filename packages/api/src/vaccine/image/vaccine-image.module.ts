import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'

import { EnvConfig } from '../../config/env.validation'
import { FakeVaccineImageAnalysisProvider } from './fake-vaccine-image-analysis.provider'
import { FakeVaccineImageStorageProvider } from './fake-vaccine-image-storage.provider'
import { UnimplementedAzureVaccineImageAnalysisProvider } from './unimplemented-azure-vaccine-image-analysis.provider'
import { UnimplementedAzureVaccineImageStorageProvider } from './unimplemented-azure-vaccine-image-storage.provider'
import { VACCINE_IMAGE_ANALYSIS_PROVIDER } from './vaccine-image-analysis.provider'
import { VaccineImageFieldsResolver } from './vaccine-image-fields.resolver'
import { resolveVaccineImageProviderMode } from './vaccine-image-provider.selection'
import { VACCINE_IMAGE_STORAGE_PROVIDER } from './vaccine-image-storage.provider'
import { VaccineImageUrlService } from './vaccine-image-url.service'

const isSchemaGeneration =
  process.argv.includes('--generate-schema-only') ||
  process.env.GENERATE_SCHEMA_ONLY === 'true'

const analysisProvider = {
  provide: VACCINE_IMAGE_ANALYSIS_PROVIDER,
  inject: [ConfigService],
  useFactory: (configService: ConfigService<EnvConfig, true>) => {
    if (isSchemaGeneration) {
      return new FakeVaccineImageAnalysisProvider()
    }

    const nodeEnv = configService.get('NODE_ENV', { infer: true })
    const mode = resolveVaccineImageProviderMode(
      configService.get('VACCINE_IMAGE_ANALYSIS_PROVIDER', { infer: true }),
      nodeEnv,
    )

    return mode === 'fake'
      ? new FakeVaccineImageAnalysisProvider()
      : new UnimplementedAzureVaccineImageAnalysisProvider()
  },
}

const storageProvider = {
  provide: VACCINE_IMAGE_STORAGE_PROVIDER,
  inject: [ConfigService],
  useFactory: (configService: ConfigService<EnvConfig, true>) => {
    if (isSchemaGeneration) {
      return new FakeVaccineImageStorageProvider()
    }

    const nodeEnv = configService.get('NODE_ENV', { infer: true })
    const mode = resolveVaccineImageProviderMode(
      configService.get('VACCINE_IMAGE_STORAGE_PROVIDER', { infer: true }),
      nodeEnv,
    )

    return mode === 'fake'
      ? new FakeVaccineImageStorageProvider()
      : new UnimplementedAzureVaccineImageStorageProvider()
  },
}

@Module({
  imports: [ConfigModule],
  providers: [
    analysisProvider,
    storageProvider,
    VaccineImageUrlService,
    VaccineImageFieldsResolver,
  ],
  exports: [
    VACCINE_IMAGE_ANALYSIS_PROVIDER,
    VACCINE_IMAGE_STORAGE_PROVIDER,
    VaccineImageUrlService,
  ],
})
export class VaccineImageModule {}
