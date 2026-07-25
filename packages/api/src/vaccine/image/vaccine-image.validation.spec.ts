import { VaccineImageAiProvider } from './vaccine-image-ai-provider.enum'
import { VaccineImageOverrideDecision } from './vaccine-image-override-decision.enum'
import { VaccineImageStorageProviderId } from './vaccine-image-storage-provider.enum'
import { VaccineImageValidationStatus } from './vaccine-image-validation-status.enum'
import { VaccineImage } from './vaccine-image.embed'
import {
  assertValidVaccineImage,
  InvalidVaccineImageException,
} from './vaccine-image.validation'

function validImage(
  overrides: Partial<VaccineImage> = {},
): VaccineImage {
  return {
    storageProvider: VaccineImageStorageProviderId.AZURE_BLOB,
    storageKey: 'vaccines/abc/image.jpg',
    originalFilename: 'image.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 12_345,
    width: 800,
    height: 600,
    validationStatus: VaccineImageValidationStatus.ACCEPTED,
    aiProvider: VaccineImageAiProvider.AZURE_VISION_4,
    aiCaption: 'A vaccine vial',
    aiConfidence: 0.91,
    aiTags: ['vaccine', 'vial'],
    aiDetectedText: ['LOT-1'],
    aiReason: null,
    analysedAt: new Date('2026-07-25T12:00:00.000Z'),
    uploadedAt: new Date('2026-07-25T11:00:00.000Z'),
    uploadedByUserId: '507f1f77bcf86cd799439011',
    adminOverride: null,
    ...overrides,
  }
}

describe('assertValidVaccineImage', () => {
  it('accepts valid image metadata', () => {
    expect(assertValidVaccineImage(validImage())).toMatchObject({
      storageKey: 'vaccines/abc/image.jpg',
      validationStatus: VaccineImageValidationStatus.ACCEPTED,
    })
  })

  it('rejects empty storageKey', () => {
    expect(() =>
      assertValidVaccineImage(validImage({ storageKey: '   ' })),
    ).toThrow(InvalidVaccineImageException)
  })

  it('rejects non-positive size and dimensions', () => {
    expect(() =>
      assertValidVaccineImage(validImage({ sizeBytes: 0 })),
    ).toThrow(InvalidVaccineImageException)
    expect(() =>
      assertValidVaccineImage(validImage({ width: -1 })),
    ).toThrow(InvalidVaccineImageException)
    expect(() =>
      assertValidVaccineImage(validImage({ height: 0 })),
    ).toThrow(InvalidVaccineImageException)
  })

  it('rejects AI confidence outside 0..1', () => {
    expect(() =>
      assertValidVaccineImage(validImage({ aiConfidence: 1.01 })),
    ).toThrow(InvalidVaccineImageException)
    expect(() =>
      assertValidVaccineImage(validImage({ aiConfidence: -0.1 })),
    ).toThrow(InvalidVaccineImageException)
  })

  it('rejects invalid override metadata', () => {
    expect(() =>
      assertValidVaccineImage(
        validImage({
          adminOverride: {
            decision: VaccineImageOverrideDecision.ACCEPTED,
            reason: '',
            overriddenAt: new Date('2026-07-25T13:00:00.000Z'),
            overriddenByUserId: '507f1f77bcf86cd799439012',
          },
        }),
      ),
    ).toThrow(InvalidVaccineImageException)

    expect(() =>
      assertValidVaccineImage(
        validImage({
          adminOverride: {
            decision: VaccineImageOverrideDecision.REJECTED,
            reason: 'Not a vaccine product photo',
            overriddenAt: new Date('2026-07-25T13:00:00.000Z'),
            overriddenByUserId: '',
          },
        }),
      ),
    ).toThrow(InvalidVaccineImageException)

    expect(() =>
      assertValidVaccineImage(
        validImage({
          adminOverride: {
            decision: VaccineImageOverrideDecision.REVIEW_REQUIRED,
            reason: 'Needs human check',
            overriddenAt: new Date('invalid'),
            overriddenByUserId: '507f1f77bcf86cd799439012',
          },
        }),
      ),
    ).toThrow(InvalidVaccineImageException)
  })

  it('rejects invalid status and provider strings', () => {
    expect(() =>
      assertValidVaccineImage(
        validImage({
          validationStatus: 'NOT_A_STATUS' as VaccineImageValidationStatus,
        }),
      ),
    ).toThrow(InvalidVaccineImageException)

    expect(() =>
      assertValidVaccineImage(
        validImage({
          storageProvider: 'S3' as VaccineImageStorageProviderId,
        }),
      ),
    ).toThrow(InvalidVaccineImageException)

    expect(() =>
      assertValidVaccineImage(
        validImage({
          aiProvider: 'OPENAI' as VaccineImageAiProvider,
        }),
      ),
    ).toThrow(InvalidVaccineImageException)
  })

  it('accepts a complete admin override', () => {
    expect(
      assertValidVaccineImage(
        validImage({
          validationStatus: VaccineImageValidationStatus.REJECTED,
          adminOverride: {
            decision: VaccineImageOverrideDecision.REJECTED,
            reason: 'Misleading packaging',
            overriddenAt: new Date('2026-07-25T13:00:00.000Z'),
            overriddenByUserId: '507f1f77bcf86cd799439012',
          },
        }),
      ).adminOverride?.decision,
    ).toBe(VaccineImageOverrideDecision.REJECTED)
  })
})
