import createImageAnalysisClient, {
  isUnexpected,
} from '@azure-rest/ai-vision-image-analysis'
import type { ImageAnalysisClient } from '@azure-rest/ai-vision-image-analysis'
import { AzureKeyCredential } from '@azure/core-auth'
import { Injectable } from '@nestjs/common'

import { mapAzureVisionError } from './azure-vaccine-image-analysis.errors'
import { mapAzureVisionAnalysisBody } from './azure-vaccine-image-analysis.mapper'
import { VaccineImageAnalysisConfigurationException } from './vaccine-image-analysis.exceptions'
import {
  VaccineImageAnalysisInput,
  VaccineImageAnalysisProvider,
  VaccineImageAnalysisResult,
} from './vaccine-image-analysis.provider'

/** Features requested from Azure AI Vision Image Analysis 4.0 (no unused paid features). */
export const AZURE_VISION_ANALYSIS_FEATURES = [
  'Caption',
  'Tags',
  'Objects',
  'Read',
] as const

export const AZURE_VISION_TIMEOUT_MS_DEFAULT = 10_000
export const AZURE_VISION_TIMEOUT_MS_MIN = 1_000
export const AZURE_VISION_TIMEOUT_MS_MAX = 30_000

export type AzureVaccineImageAnalysisConfig = {
  endpoint: string
  key: string
  timeoutMs: number
}

/**
 * Production Azure AI Vision Image Analysis 4.0 provider.
 * Client is constructed once per provider instance (no Azure call at startup).
 * Analysis uses binary image bytes — never a public image URL.
 */
@Injectable()
export class AzureVaccineImageAnalysisProvider
  implements VaccineImageAnalysisProvider
{
  private readonly client: ImageAnalysisClient
  private readonly timeoutMs: number

  private constructor(client: ImageAnalysisClient, timeoutMs: number) {
    this.client = client
    this.timeoutMs = timeoutMs
  }

  /**
   * Build a provider from validated env config.
   * Constructs the Azure REST client once; does not call Vision at startup.
   */
  static fromConfig(
    config: AzureVaccineImageAnalysisConfig,
  ): AzureVaccineImageAnalysisProvider {
    const endpoint = assertHttpsVisionEndpoint(config.endpoint)
    const key = assertNonEmptySecret(config.key, 'AZURE_VISION_KEY')
    const timeoutMs = assertVisionTimeoutMs(config.timeoutMs)

    const client = createImageAnalysisClient(
      endpoint,
      new AzureKeyCredential(key),
    )

    return new AzureVaccineImageAnalysisProvider(client, timeoutMs)
  }

  /** Test seam: inject a mock client without touching Azure. */
  static fromClient(
    client: ImageAnalysisClient,
    timeoutMs: number = AZURE_VISION_TIMEOUT_MS_DEFAULT,
  ): AzureVaccineImageAnalysisProvider {
    return new AzureVaccineImageAnalysisProvider(
      client,
      assertVisionTimeoutMs(timeoutMs),
    )
  }

  async analyse(
    input: VaccineImageAnalysisInput,
  ): Promise<VaccineImageAnalysisResult> {
    if (!Buffer.isBuffer(input.bytes) || input.bytes.length === 0) {
      throw new VaccineImageAnalysisConfigurationException(
        'Vaccine image analysis requires non-empty validated bytes',
      )
    }

    try {
      const response = await this.client.path('/imageanalysis:analyze').post({
        body: input.bytes,
        contentType: 'application/octet-stream',
        queryParameters: {
          features: [...AZURE_VISION_ANALYSIS_FEATURES],
          language: 'en',
          'gender-neutral-caption': true,
        },
        abortSignal: AbortSignal.timeout(this.timeoutMs),
      })

      if (isUnexpected(response)) {
        mapAzureVisionError({
          status: response.status,
          body: sanitizeErrorBody(response.body),
          code: readHeaderErrorCode(response),
        })
      }

      return mapAzureVisionAnalysisBody(response.body)
    } catch (error) {
      mapAzureVisionError(error)
    }
  }
}

export function assertHttpsVisionEndpoint(endpoint: string): string {
  if (typeof endpoint !== 'string' || endpoint.trim().length === 0) {
    throw new VaccineImageAnalysisConfigurationException(
      'AZURE_VISION_ENDPOINT is required when vaccine image analysis provider is azure',
    )
  }

  let parsed: URL
  try {
    parsed = new URL(endpoint.trim())
  } catch {
    throw new VaccineImageAnalysisConfigurationException(
      'AZURE_VISION_ENDPOINT must be a valid HTTPS URL',
    )
  }

  if (parsed.protocol !== 'https:') {
    throw new VaccineImageAnalysisConfigurationException(
      'AZURE_VISION_ENDPOINT must use HTTPS',
    )
  }

  // Strip trailing slash for consistent client base URL composition.
  return endpoint.trim().replace(/\/+$/, '')
}

export function assertVisionTimeoutMs(timeoutMs: number): number {
  if (
    typeof timeoutMs !== 'number' ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < AZURE_VISION_TIMEOUT_MS_MIN ||
    timeoutMs > AZURE_VISION_TIMEOUT_MS_MAX
  ) {
    throw new VaccineImageAnalysisConfigurationException(
      `AZURE_VISION_TIMEOUT_MS must be an integer between ${AZURE_VISION_TIMEOUT_MS_MIN} and ${AZURE_VISION_TIMEOUT_MS_MAX}`,
    )
  }
  return timeoutMs
}

function assertNonEmptySecret(value: string, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new VaccineImageAnalysisConfigurationException(
      `${name} is required when vaccine image analysis provider is azure`,
    )
  }
  return value.trim()
}

function readHeaderErrorCode(response: {
  headers?: Record<string, unknown>
}): string | undefined {
  const headers = response.headers
  if (!headers || typeof headers !== 'object') {
    return undefined
  }
  const value =
    headers['x-ms-error-code'] ?? headers['X-Ms-Error-Code'] ?? undefined
  return typeof value === 'string' ? value : undefined
}

/**
 * Keep only non-sensitive error fields for mapping. Never retain raw bodies
 * beyond code/message hints used for status classification.
 */
function sanitizeErrorBody(body: unknown): {
  error?: { code?: string; message?: string }
} {
  if (!body || typeof body !== 'object') {
    return {}
  }
  const record = body as {
    error?: { code?: unknown; message?: unknown }
    code?: unknown
    message?: unknown
  }
  const code =
    typeof record.error?.code === 'string'
      ? record.error.code
      : typeof record.code === 'string'
        ? record.code
        : undefined
  const message =
    typeof record.error?.message === 'string'
      ? record.error.message.slice(0, 200)
      : typeof record.message === 'string'
        ? record.message.slice(0, 200)
        : undefined

  if (!code && !message) {
    return {}
  }
  return { error: { code, message } }
}
