import { Test, TestingModule } from '@nestjs/testing'

import { FakeVaccineImageStorageProvider } from './fake-vaccine-image-storage.provider'
import { VaccineImageAiProvider } from './vaccine-image-ai-provider.enum'
import { VaccineImage } from './vaccine-image.embed'
import { VaccineImageStorageProviderId } from './vaccine-image-storage-provider.enum'
import { VACCINE_IMAGE_STORAGE_PROVIDER } from './vaccine-image-storage.provider'
import { VaccineImageUrlService } from './vaccine-image-url.service'
import { VaccineImageValidationStatus } from './vaccine-image-validation-status.enum'
import { assertValidVaccineImage } from './vaccine-image.validation'

function buildImage(
  status: VaccineImageValidationStatus,
  storageKey = 'vaccines/abc/image.jpg',
): VaccineImage {
  return assertValidVaccineImage({
    storageProvider: VaccineImageStorageProviderId.FAKE,
    storageKey,
    originalFilename: 'image.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    width: 100,
    height: 80,
    validationStatus: status,
    aiProvider: VaccineImageAiProvider.FAKE,
    aiTags: [],
    aiDetectedText: [],
    uploadedAt: new Date('2026-07-25T12:00:00.000Z'),
    uploadedByUserId: '507f1f77bcf86cd799439099',
  })
}

describe('VaccineImageUrlService', () => {
  let service: VaccineImageUrlService
  let storage: FakeVaccineImageStorageProvider

  beforeEach(async () => {
    storage = new FakeVaccineImageStorageProvider()
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaccineImageUrlService,
        {
          provide: VACCINE_IMAGE_STORAGE_PROVIDER,
          useValue: storage,
        },
      ],
    }).compile()

    service = module.get(VaccineImageUrlService)
  })

  it('returns null when there is no image', async () => {
    await expect(service.resolveReadUrl(null)).resolves.toBeNull()
    await expect(service.resolveReadUrl(undefined)).resolves.toBeNull()
  })

  it.each([
    VaccineImageValidationStatus.PENDING_ANALYSIS,
    VaccineImageValidationStatus.REJECTED,
    VaccineImageValidationStatus.ANALYSIS_FAILED,
  ])('returns null for non-browseable status %s', async status => {
    const image = buildImage(status)
    await storage.store({
      bytes: Buffer.from('img'),
      storageKey: image.storageKey,
      mimeType: image.mimeType,
    })

    await expect(service.resolveReadUrl(image)).resolves.toBeNull()
  })

  it.each([
    VaccineImageValidationStatus.ACCEPTED,
    VaccineImageValidationStatus.REVIEW_REQUIRED,
  ])('returns a temporary URL for browseable status %s', async status => {
    const image = buildImage(status)
    await storage.store({
      bytes: Buffer.from('img'),
      storageKey: image.storageKey,
      mimeType: image.mimeType,
    })

    const url = await service.resolveReadUrl(image)
    expect(url).toMatch(/^https:\/\/fake-vaccine-image\.local\/read\//)
    expect(url).toContain(encodeURIComponent(image.storageKey))
  })

  it('never persists imageUrl onto VaccineImage metadata', async () => {
    const image = buildImage(VaccineImageValidationStatus.ACCEPTED)
    await storage.store({
      bytes: Buffer.from('img'),
      storageKey: image.storageKey,
      mimeType: image.mimeType,
    })

    await service.resolveReadUrl(image)

    expect(image).not.toHaveProperty('imageUrl')
    expect(Object.keys(image)).not.toContain('imageUrl')
  })
})
