import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'

import { EnvConfig } from '../../config/env.validation'
import {
  AZURE_VISION_TIMEOUT_MS_DEFAULT,
  AzureVaccineImageAnalysisProvider,
} from './azure-vaccine-image-analysis.provider'
import { AzureVaccineImageStorageProvider } from './azure-vaccine-image-storage.provider'
import { FakeVaccineImageAnalysisProvider } from './fake-vaccine-image-analysis.provider'
import { FakeVaccineImageStorageProvider } from './fake-vaccine-image-storage.provider'
import { VACCINE_IMAGE_ANALYSIS_PROVIDER } from './vaccine-image-analysis.provider'
import { VaccineImageAnalysisService } from './vaccine-image-analysis.service'
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

    if (mode === 'fake') {
      return new FakeVaccineImageAnalysisProvider()
    }

    return AzureVaccineImageAnalysisProvider.fromConfig({
      endpoint: configService.getOrThrow('AZURE_VISION_ENDPOINT', {
        infer: true,
      }),
      key: configService.getOrThrow('AZURE_VISION_KEY', { infer: true }),
      timeoutMs:
        configService.get('AZURE_VISION_TIMEOUT_MS', { infer: true }) ??
        AZURE_VISION_TIMEOUT_MS_DEFAULT,
    })
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

    if (mode === 'fake') {
      return new FakeVaccineImageStorageProvider()
    }

    return AzureVaccineImageStorageProvider.fromConfig({
      connectionString: configService.getOrThrow(
        'AZURE_STORAGE_CONNECTION_STRING',
        { infer: true },
      ),
      containerName: configService.getOrThrow('AZURE_STORAGE_CONTAINER_NAME', {
        infer: true,
      }),
      readUrlTtlSeconds: configService.get(
        'AZURE_STORAGE_READ_URL_TTL_SECONDS',
        { infer: true },
      ),
    })
  },
}

@Module({
  imports: [ConfigModule],
  providers: [
    analysisProvider,
    storageProvider,
    VaccineImageAnalysisService,
    VaccineImageUrlService,
    VaccineImageFieldsResolver,
  ],
  exports: [
    VACCINE_IMAGE_ANALYSIS_PROVIDER,
    VACCINE_IMAGE_STORAGE_PROVIDER,
    VaccineImageAnalysisService,
    VaccineImageUrlService,
  ],
})
export class VaccineImageModule {}
