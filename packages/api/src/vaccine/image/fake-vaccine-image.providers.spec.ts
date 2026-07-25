import { FakeVaccineImageAnalysisProvider } from './fake-vaccine-image-analysis.provider'
import { FakeVaccineImageStorageProvider } from './fake-vaccine-image-storage.provider'
import { VaccineImageAiProvider } from './vaccine-image-ai-provider.enum'
import { VaccineImageBlobNotFoundException } from './vaccine-image-storage.exceptions'
import { VaccineImageStorageProviderId } from './vaccine-image-storage-provider.enum'

describe('FakeVaccineImageAnalysisProvider', () => {
  it('is deterministic for the same bytes and metadata', async () => {
    const provider = new FakeVaccineImageAnalysisProvider()
    const input = {
      bytes: Buffer.from('deterministic-vaccine-image'),
      mimeType: 'image/png',
      filename: 'vial.png',
      width: 640,
      height: 480,
    }

    const first = await provider.analyse(input)
    const second = await provider.analyse(input)

    expect(first).toEqual(second)
    expect(first.provider).toBe(VaccineImageAiProvider.FAKE)
    expect(first.caption).toBe('fake-caption:vial.png')
    expect(first.captionConfidence).toBeGreaterThanOrEqual(0)
    expect(first.captionConfidence).toBeLessThanOrEqual(1)
    expect(first.tags).toEqual([
      { name: 'fake', confidence: 1 },
      { name: 'image/png', confidence: 1 },
      { name: '640x480', confidence: 1 },
    ])
    expect(first.detectedObjects[0]?.name).toBe('vaccine-vial')
    expect(first.detectedObjects[0]?.confidence).toBeGreaterThanOrEqual(0)
    expect(first.detectedObjects[0]?.confidence).toBeLessThanOrEqual(1)
    expect(first.analysedAt.toISOString()).toBe('2026-07-25T12:00:00.000Z')
  })
})

describe('FakeVaccineImageStorageProvider', () => {
  it('stores, returns temporary read URLs, and deletes', async () => {
    const provider = new FakeVaccineImageStorageProvider()
    const storageKey = 'vaccines/test/vial.png'
    const bytes = Buffer.from('png-bytes')

    const stored = await provider.store({
      bytes,
      storageKey,
      mimeType: 'image/png',
      metadata: { vaccineId: 'abc' },
    })

    expect(stored).toEqual({
      provider: VaccineImageStorageProviderId.FAKE,
      storageKey,
    })
    expect(provider.has(storageKey)).toBe(true)
    expect(provider.getBytes(storageKey)?.equals(bytes)).toBe(true)

    const url = await provider.createReadUrl({
      storageKey,
      expiresInSeconds: 60,
    })
    expect(url).toMatch(
      /^https:\/\/fake-vaccine-image\.local\/read\/vaccines%2Ftest%2Fvial\.png\?expires=\d+$/,
    )
    const expires = Number(new URL(url).searchParams.get('expires'))
    expect(expires).toBeGreaterThan(Date.now())
    expect(expires).toBeLessThanOrEqual(Date.now() + 60_000 + 1_000)

    await provider.delete(storageKey)
    expect(provider.has(storageKey)).toBe(false)
    await expect(provider.createReadUrl({ storageKey })).rejects.toBeInstanceOf(
      VaccineImageBlobNotFoundException,
    )
  })
})
