import createImageAnalysisClient from '@azure-rest/ai-vision-image-analysis'
import { AzureKeyCredential } from '@azure/core-auth'

import {
  AZURE_VISION_ANALYSIS_FEATURES,
  AzureVaccineImageAnalysisProvider,
  assertHttpsVisionEndpoint,
  assertVisionTimeoutMs,
} from './azure-vaccine-image-analysis.provider'
import { VACCINE_IMAGE_ANALYSIS_MAX_TAGS } from './vaccine-image-analysis.bounds'
import {
  VaccineImageAnalysisConfigurationException,
  VaccineImageAnalysisInvalidCredentialsException,
  VaccineImageAnalysisPermissionDeniedException,
  VaccineImageAnalysisRateLimitedException,
  VaccineImageAnalysisTimeoutException,
  VaccineImageAnalysisUnsupportedImageException,
} from './vaccine-image-analysis.exceptions'
import { VaccineImageAiProvider } from './vaccine-image-ai-provider.enum'

type MockVisionClient = {
  path: jest.Mock
  post: jest.Mock
}

jest.mock('@azure-rest/ai-vision-image-analysis', () => {
  const createClient = jest.fn()
  return {
    __esModule: true,
    default: createClient,
    isUnexpected: (response: { status: string }) => response.status !== '200',
  }
})

jest.mock('@azure/core-auth', () => ({
  AzureKeyCredential: jest.fn().mockImplementation((key: string) => ({ key })),
}))

const createClientMock = createImageAnalysisClient as unknown as jest.Mock
const AzureKeyCredentialMock = AzureKeyCredential as unknown as jest.Mock

function createMockClient(): MockVisionClient {
  const post = jest.fn()
  const path = jest.fn(() => ({ post }))
  return { path, post }
}

describe('AzureVaccineImageAnalysisProvider', () => {
  const endpoint = 'https://example.cognitiveservices.azure.com'
  const key = 'test-vision-key-not-real'
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0])

  let mockClient: MockVisionClient

  beforeEach(() => {
    mockClient = createMockClient()
    createClientMock.mockReset()
    createClientMock.mockReturnValue(mockClient)
    AzureKeyCredentialMock.mockClear()
  })

  function createProvider(timeoutMs = 10_000) {
    return AzureVaccineImageAnalysisProvider.fromConfig({
      endpoint,
      key,
      timeoutMs,
    })
  }

  it('constructs the Azure client once per provider instance', async () => {
    const provider = createProvider()
    mockClient.post.mockResolvedValue({
      status: '200',
      body: {
        modelVersion: '2023-10-01',
        metadata: { width: 100, height: 100 },
        tagsResult: { values: [] },
      },
    })

    await provider.analyse({
      bytes,
      mimeType: 'image/jpeg',
      filename: 'vial.jpg',
      width: 100,
      height: 100,
    })
    await provider.analyse({
      bytes,
      mimeType: 'image/jpeg',
      filename: 'vial.jpg',
      width: 100,
      height: 100,
    })

    expect(createClientMock).toHaveBeenCalledTimes(1)
    expect(createClientMock).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({ key }),
    )
    expect(AzureKeyCredentialMock).toHaveBeenCalledWith(key)
    expect(mockClient.post).toHaveBeenCalledTimes(2)
  })

  it('requires HTTPS endpoint', () => {
    expect(() =>
      assertHttpsVisionEndpoint('http://insecure.example.com'),
    ).toThrow(VaccineImageAnalysisConfigurationException)
    expect(() => assertHttpsVisionEndpoint(endpoint)).not.toThrow()
  })

  it('rejects invalid timeout values', () => {
    expect(() => assertVisionTimeoutMs(500)).toThrow(
      VaccineImageAnalysisConfigurationException,
    )
    expect(() => assertVisionTimeoutMs(60_000)).toThrow(
      VaccineImageAnalysisConfigurationException,
    )
    expect(assertVisionTimeoutMs(10_000)).toBe(10_000)
  })

  it('sends binary bytes and only Caption/Tags/Objects/Read features', async () => {
    const provider = createProvider()
    mockClient.post.mockResolvedValue({
      status: '200',
      body: {
        modelVersion: '2023-10-01',
        metadata: { width: 100, height: 100 },
        captionResult: { text: 'A vaccine vial', confidence: 0.91 },
        tagsResult: { values: [{ name: 'vaccine', confidence: 0.88 }] },
        objectsResult: {
          values: [{ tags: [{ name: 'vial', confidence: 0.77 }] }],
        },
        readResult: { blocks: [{ lines: [{ text: 'COVID vaccine' }] }] },
      },
    })

    const result = await provider.analyse({
      bytes,
      mimeType: 'image/jpeg',
      filename: 'vial.jpg',
      width: 100,
      height: 100,
    })

    expect(mockClient.path).toHaveBeenCalledWith('/imageanalysis:analyze')
    expect(mockClient.post).toHaveBeenCalledTimes(1)
    const call = mockClient.post.mock.calls[0] as unknown as [
      {
        body: Buffer
        contentType: string
        queryParameters: {
          features: string[]
          language: string
          'gender-neutral-caption': boolean
        }
        abortSignal: AbortSignal
      },
    ]
    expect(call[0].body).toBe(bytes)
    expect(call[0].contentType).toBe('application/octet-stream')
    expect(call[0].queryParameters.features).toEqual([
      ...AZURE_VISION_ANALYSIS_FEATURES,
    ])
    expect(call[0].queryParameters.features).toEqual([
      'Caption',
      'Tags',
      'Objects',
      'Read',
    ])
    expect(call[0].queryParameters.language).toBe('en')
    expect(call[0].queryParameters['gender-neutral-caption']).toBe(true)
    expect(call[0].abortSignal).toBeInstanceOf(AbortSignal)

    expect(result.provider).toBe(VaccineImageAiProvider.AZURE_VISION_4)
    expect(result.caption).toBe('A vaccine vial')
    expect(result.captionConfidence).toBe(0.91)
    expect(result.tags).toEqual([{ name: 'vaccine', confidence: 0.88 }])
    expect(result.detectedObjects).toEqual([{ name: 'vial', confidence: 0.77 }])
    expect(result.detectedText).toEqual(['COVID vaccine'])
    expect(result.rawEvidenceSummary).toContain('azure-vision-4')
    expect(JSON.stringify(result)).not.toContain(key)
    expect(JSON.stringify(result)).not.toContain(bytes.toString('hex'))
  })

  it('bounds unusually large Azure responses', async () => {
    const provider = createProvider()
    const hugeTags = Array.from({ length: 200 }, (_, index) => ({
      name: `tag-${index}-${'x'.repeat(200)}`,
      confidence: 0.5,
    }))
    mockClient.post.mockResolvedValue({
      status: '200',
      body: {
        modelVersion: '2023-10-01',
        metadata: { width: 100, height: 100 },
        captionResult: {
          text: 'c'.repeat(2_000),
          confidence: 1.5,
        },
        tagsResult: { values: hugeTags },
        objectsResult: { values: [] },
        readResult: {
          blocks: [
            {
              lines: Array.from({ length: 200 }, (_, index) => ({
                text: `line-${index}-${'y'.repeat(400)}`,
              })),
            },
          ],
        },
      },
    })

    const result = await provider.analyse({
      bytes,
      mimeType: 'image/jpeg',
      filename: 'huge.jpg',
      width: 100,
      height: 100,
    })

    expect(result.tags.length).toBeLessThanOrEqual(
      VACCINE_IMAGE_ANALYSIS_MAX_TAGS,
    )
    expect(result.caption?.length).toBeLessThanOrEqual(512)
    expect(result.captionConfidence).toBe(1)
    expect(result.detectedText.length).toBeLessThanOrEqual(64)
    expect(result.detectedText.every((line) => line.length <= 256)).toBe(true)
  })

  it('maps timeout errors safely without exposing secrets or bytes', async () => {
    const provider = createProvider()
    const abortError = new Error('The operation was aborted')
    abortError.name = 'AbortError'
    mockClient.post.mockRejectedValue(abortError)

    await expect(
      provider.analyse({
        bytes,
        mimeType: 'image/jpeg',
        filename: 'vial.jpg',
        width: 100,
        height: 100,
      }),
    ).rejects.toBeInstanceOf(VaccineImageAnalysisTimeoutException)

    try {
      await provider.analyse({
        bytes,
        mimeType: 'image/jpeg',
        filename: 'vial.jpg',
        width: 100,
        height: 100,
      })
    } catch (error) {
      const serialized = JSON.stringify(
        (error as { getResponse?: () => unknown }).getResponse?.() ?? error,
      )
      expect(serialized).not.toContain(key)
      expect(serialized).not.toContain(bytes.toString('base64'))
    }
  })

  it('maps rate limit, auth, permission, and unsupported image errors', async () => {
    const provider = createProvider()

    mockClient.post.mockResolvedValueOnce({
      status: '429',
      body: { error: { code: 'TooManyRequests', message: 'throttled' } },
      headers: { get: () => 'TooManyRequests' },
    })
    await expect(
      provider.analyse({
        bytes,
        mimeType: 'image/jpeg',
        filename: 'vial.jpg',
        width: 100,
        height: 100,
      }),
    ).rejects.toBeInstanceOf(VaccineImageAnalysisRateLimitedException)

    mockClient.post.mockResolvedValueOnce({
      status: '401',
      body: { error: { code: 'Unauthorized', message: 'bad key' } },
      headers: { get: () => 'Unauthorized' },
    })
    await expect(
      provider.analyse({
        bytes,
        mimeType: 'image/jpeg',
        filename: 'vial.jpg',
        width: 100,
        height: 100,
      }),
    ).rejects.toBeInstanceOf(VaccineImageAnalysisInvalidCredentialsException)

    mockClient.post.mockResolvedValueOnce({
      status: '403',
      body: { error: { code: 'Forbidden', message: 'denied' } },
      headers: { get: () => 'Forbidden' },
    })
    await expect(
      provider.analyse({
        bytes,
        mimeType: 'image/jpeg',
        filename: 'vial.jpg',
        width: 100,
        height: 100,
      }),
    ).rejects.toBeInstanceOf(VaccineImageAnalysisPermissionDeniedException)

    mockClient.post.mockResolvedValueOnce({
      status: '400',
      body: {
        error: { code: 'InvalidImage', message: 'not a valid image' },
      },
      headers: { get: () => 'InvalidImage' },
    })
    await expect(
      provider.analyse({
        bytes,
        mimeType: 'image/jpeg',
        filename: 'vial.jpg',
        width: 100,
        height: 100,
      }),
    ).rejects.toBeInstanceOf(VaccineImageAnalysisUnsupportedImageException)
  })
})
