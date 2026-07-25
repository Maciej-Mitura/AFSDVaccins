import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { getRepositoryToken } from '@nestjs/typeorm'

import { ApplicationCacheService } from '../../common/cache/application-cache.service'
import { UserRole } from '../../user/user-role.enum'
import { User } from '../../user/user.entity'
import { Vaccine } from '../vaccine.entity'
import { createTestPng } from './__tests__/test-image.fixtures'
import { VaccineImageAiProvider } from './vaccine-image-ai-provider.enum'
import { VaccineImageAnalysisService } from './vaccine-image-analysis.service'
import { VaccineImageAuditEventType } from './vaccine-image-audit.entity'
import { VaccineImageAuditService } from './vaccine-image-audit.service'
import { VaccineImageLifecycleService } from './vaccine-image-lifecycle.service'
import { VaccineImageOverrideDecision } from './vaccine-image-override-decision.enum'
import { VACCINE_IMAGE_STORAGE_PROVIDER } from './vaccine-image-storage.provider'
import { VaccineImageStorageProviderId } from './vaccine-image-storage-provider.enum'
import {
  VaccineImageConcurrentModificationException,
  VaccineImageNotPresentException,
} from './vaccine-image-upload.exceptions'
import { VaccineImageUrlService } from './vaccine-image-url.service'
import { VaccineImageValidationStatus } from './vaccine-image-validation-status.enum'
import { VaccineImage } from './vaccine-image.embed'

describe('VaccineImageLifecycleService', () => {
  const vaccineId = '507f1f77bcf86cd799439011'

  const admin: User = {
    _id: '507f1f77bcf86cd799439099',
    id: '507f1f77bcf86cd799439099',
    firebaseUid: 'admin-uid',
    email: 'admin@example.com',
    firstName: 'Ada',
    lastName: 'Admin',
    role: UserRole.ADMIN,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  let service: VaccineImageLifecycleService
  let vaccineRepository: {
    findOne: jest.Mock
    findOneAndUpdate: jest.Mock
  }
  let storage: {
    store: jest.Mock
    delete: jest.Mock
    createReadUrl: jest.Mock
  }
  let analysisService: { analyseAndClassify: jest.Mock }
  let imageUrlService: { resolveReadUrl: jest.Mock }
  let auditService: { record: jest.Mock }
  let applicationCache: { invalidateVaccines: jest.Mock }

  function baseVaccine(image?: VaccineImage | null): Vaccine {
    return {
      _id: vaccineId,
      id: vaccineId,
      name: 'Influenza',
      normalizedName: 'influenza',
      description: '',
      manufacturer: 'Pharma',
      stockQuantity: 10,
      stockWarningThreshold: 2,
      active: true,
      image: image ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  beforeEach(async () => {
    vaccineRepository = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
    }
    storage = {
      store: jest.fn().mockImplementation((input: { storageKey: string }) =>
        Promise.resolve({
          provider: VaccineImageStorageProviderId.FAKE,
          storageKey: input.storageKey,
        }),
      ),
      delete: jest.fn().mockResolvedValue(undefined),
      createReadUrl: jest.fn(),
    }
    analysisService = {
      analyseAndClassify: jest.fn().mockResolvedValue({
        analysis: {
          provider: VaccineImageAiProvider.FAKE,
          caption: 'A vaccine vial',
          captionConfidence: 0.9,
          tags: [{ name: 'vaccine', confidence: 0.95 }],
          detectedObjects: [],
          detectedText: ['FLU VACCINE'],
          rawEvidenceSummary: 'ok',
          analysedAt: new Date('2026-07-25T12:00:00.000Z'),
        },
        classification: {
          status: VaccineImageValidationStatus.ACCEPTED,
          score: 0.9,
          reason: 'Strong vaccine evidence at sufficient confidence',
          matchedEvidence: ['tag:vaccine'],
          matchedTerms: ['vaccine'],
        },
      }),
    }
    imageUrlService = {
      resolveReadUrl: jest
        .fn()
        .mockResolvedValue('https://fake-vaccine-image.local/read/x'),
    }
    auditService = { record: jest.fn().mockResolvedValue(undefined) }
    applicationCache = {
      invalidateVaccines: jest.fn().mockResolvedValue(undefined),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaccineImageLifecycleService,
        {
          provide: getRepositoryToken(Vaccine),
          useValue: vaccineRepository,
        },
        {
          provide: VACCINE_IMAGE_STORAGE_PROVIDER,
          useValue: storage,
        },
        {
          provide: VaccineImageAnalysisService,
          useValue: analysisService,
        },
        {
          provide: VaccineImageUrlService,
          useValue: imageUrlService,
        },
        {
          provide: VaccineImageAuditService,
          useValue: auditService,
        },
        {
          provide: ApplicationCacheService,
          useValue: applicationCache,
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'VACCINE_IMAGE_ANALYSIS_PROVIDER') return 'fake'
              if (key === 'NODE_ENV') return 'test'
              return undefined
            },
          },
        },
      ],
    }).compile()

    service = module.get(VaccineImageLifecycleService)
  })

  it('uploads, persists metadata, and audits without exposing storageKey', async () => {
    vaccineRepository.findOne.mockResolvedValue(baseVaccine(null))
    vaccineRepository.findOneAndUpdate.mockResolvedValue(baseVaccine())

    const result = await service.uploadOrReplace({
      vaccineId,
      actor: admin,
      bytes: createTestPng(200, 200),
      originalFilename: '../../secret-name.png',
      declaredMimeType: 'image/png',
    })

    expect(analysisService.analyseAndClassify).toHaveBeenCalled()
    expect(storage.store).toHaveBeenCalledTimes(1)
    const storeCalls = storage.store.mock.calls as unknown as Array<
      [{ storageKey: string }]
    >
    const storeArg = storeCalls[0][0]
    expect(storeArg.storageKey).toMatch(
      /^vaccines\/507f1f77bcf86cd799439011\/[0-9a-f-]{36}\.png$/,
    )
    expect(storeArg.storageKey).not.toContain('secret-name')

    expect(result.image.validationStatus).toBe(
      VaccineImageValidationStatus.ACCEPTED,
    )
    expect(result.image.imageUrl).toBe(
      'https://fake-vaccine-image.local/read/x',
    )
    expect(JSON.stringify(result)).not.toContain('storageKey')
    expect(applicationCache.invalidateVaccines).toHaveBeenCalled()
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: VaccineImageAuditEventType.VACCINE_IMAGE_UPLOADED,
        vaccineId,
        actorId: admin._id,
      }),
    )
    const auditCalls = auditService.record.mock.calls as unknown as Array<
      [Record<string, unknown>]
    >
    const auditPayload = JSON.stringify(auditCalls[0][0])
    expect(auditPayload).not.toContain('FLU VACCINE')
    expect(auditPayload).not.toMatch(/AccountKey|SAS|connection/i)
  })

  it('persists REVIEW_REQUIRED and keeps browseable URL', async () => {
    analysisService.analyseAndClassify.mockResolvedValue({
      analysis: {
        provider: VaccineImageAiProvider.FAKE,
        caption: 'Medicine bottle',
        captionConfidence: 0.6,
        tags: [{ name: 'bottle', confidence: 0.7 }],
        detectedObjects: [],
        detectedText: [],
        rawEvidenceSummary: 'ok',
        analysedAt: new Date(),
      },
      classification: {
        status: VaccineImageValidationStatus.REVIEW_REQUIRED,
        score: 0.4,
        reason: 'Plausible medical image',
        matchedEvidence: [],
        matchedTerms: ['bottle'],
      },
    })
    vaccineRepository.findOne.mockResolvedValue(baseVaccine(null))
    vaccineRepository.findOneAndUpdate.mockResolvedValue(baseVaccine())

    const result = await service.uploadOrReplace({
      vaccineId,
      actor: admin,
      bytes: createTestPng(220, 220),
      originalFilename: 'bottle.png',
      declaredMimeType: 'image/png',
    })

    expect(result.image.validationStatus).toBe(
      VaccineImageValidationStatus.REVIEW_REQUIRED,
    )
    expect(result.image.imageUrl).toBeTruthy()
  })

  it('stores REJECTED images but does not return browseable URL', async () => {
    analysisService.analyseAndClassify.mockResolvedValue({
      analysis: {
        provider: VaccineImageAiProvider.FAKE,
        caption: 'A cat',
        captionConfidence: 0.9,
        tags: [{ name: 'cat', confidence: 0.9 }],
        detectedObjects: [],
        detectedText: [],
        rawEvidenceSummary: 'ok',
        analysedAt: new Date(),
      },
      classification: {
        status: VaccineImageValidationStatus.REJECTED,
        score: 0.05,
        reason: 'No meaningful medical evidence',
        matchedEvidence: [],
        matchedTerms: [],
      },
    })
    imageUrlService.resolveReadUrl.mockResolvedValue(null)
    vaccineRepository.findOne.mockResolvedValue(baseVaccine(null))
    vaccineRepository.findOneAndUpdate.mockResolvedValue(baseVaccine())

    const result = await service.uploadOrReplace({
      vaccineId,
      actor: admin,
      bytes: createTestPng(200, 200),
      originalFilename: 'cat.png',
      declaredMimeType: 'image/png',
    })

    expect(result.image.validationStatus).toBe(
      VaccineImageValidationStatus.REJECTED,
    )
    expect(result.image.imageUrl).toBeNull()
    expect(storage.store).toHaveBeenCalled()
  })

  it('stores ANALYSIS_FAILED images without browseable URL', async () => {
    analysisService.analyseAndClassify.mockResolvedValue({
      analysis: null,
      classification: {
        status: VaccineImageValidationStatus.ANALYSIS_FAILED,
        score: 0,
        reason: 'provider failed',
        matchedEvidence: [],
        matchedTerms: [],
      },
      errorCode: 'VACCINE_IMAGE_ANALYSIS_TIMEOUT',
    })
    imageUrlService.resolveReadUrl.mockResolvedValue(null)
    vaccineRepository.findOne.mockResolvedValue(baseVaccine(null))
    vaccineRepository.findOneAndUpdate.mockResolvedValue(baseVaccine())

    const result = await service.uploadOrReplace({
      vaccineId,
      actor: admin,
      bytes: createTestPng(200, 200),
      originalFilename: 'x.png',
      declaredMimeType: 'image/png',
    })

    expect(result.image.validationStatus).toBe(
      VaccineImageValidationStatus.ANALYSIS_FAILED,
    )
    expect(result.image.imageUrl).toBeNull()
  })

  it('does not call analysis or storage when validation fails', async () => {
    vaccineRepository.findOne.mockResolvedValue(baseVaccine(null))

    await expect(
      service.uploadOrReplace({
        vaccineId,
        actor: admin,
        bytes: Buffer.from('not-an-image'),
        originalFilename: 'x.jpg',
      }),
    ).rejects.toBeTruthy()

    expect(analysisService.analyseAndClassify).not.toHaveBeenCalled()
    expect(storage.store).not.toHaveBeenCalled()
    expect(vaccineRepository.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('deletes new blob and preserves previous when Mongo persistence fails', async () => {
    const previous: VaccineImage = {
      storageProvider: VaccineImageStorageProviderId.FAKE,
      storageKey: 'vaccines/507f1f77bcf86cd799439011/old.png',
      originalFilename: 'old.png',
      mimeType: 'image/png',
      sizeBytes: 1000,
      width: 200,
      height: 200,
      validationStatus: VaccineImageValidationStatus.ACCEPTED,
      aiProvider: VaccineImageAiProvider.FAKE,
      aiTags: [],
      aiDetectedText: [],
      uploadedAt: new Date(),
      uploadedByUserId: admin._id,
    }
    vaccineRepository.findOne.mockResolvedValue(baseVaccine(previous))
    vaccineRepository.findOneAndUpdate.mockRejectedValue(
      new Error('mongo unavailable'),
    )

    await expect(
      service.uploadOrReplace({
        vaccineId,
        actor: admin,
        bytes: createTestPng(200, 200),
        originalFilename: 'new.png',
        declaredMimeType: 'image/png',
      }),
    ).rejects.toThrow('mongo unavailable')

    expect(storage.store).toHaveBeenCalledTimes(1)
    const storeCalls = storage.store.mock.calls as unknown as Array<
      [{ storageKey: string }]
    >
    const newKey = storeCalls[0][0].storageKey
    expect(storage.delete).toHaveBeenCalledWith(newKey)
    expect(storage.delete).not.toHaveBeenCalledWith(previous.storageKey)
  })

  it('deletes previous blob only after successful replacement', async () => {
    const previousKey = 'vaccines/507f1f77bcf86cd799439011/old.png'
    const previous: VaccineImage = {
      storageProvider: VaccineImageStorageProviderId.FAKE,
      storageKey: previousKey,
      originalFilename: 'old.png',
      mimeType: 'image/png',
      sizeBytes: 1000,
      width: 200,
      height: 200,
      validationStatus: VaccineImageValidationStatus.ACCEPTED,
      aiProvider: VaccineImageAiProvider.FAKE,
      aiTags: [],
      aiDetectedText: [],
      uploadedAt: new Date(),
      uploadedByUserId: admin._id,
    }
    vaccineRepository.findOne.mockResolvedValue(baseVaccine(previous))
    vaccineRepository.findOneAndUpdate.mockResolvedValue(baseVaccine())

    await service.uploadOrReplace({
      vaccineId,
      actor: admin,
      bytes: createTestPng(200, 200),
      originalFilename: 'new.png',
      declaredMimeType: 'image/png',
    })

    expect(storage.delete).toHaveBeenCalledWith(previousKey)
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: VaccineImageAuditEventType.VACCINE_IMAGE_REPLACED,
        replaced: true,
      }),
    )
  })

  it('keeps replacement when previous blob deletion fails', async () => {
    const previousKey = 'vaccines/507f1f77bcf86cd799439011/old.png'
    vaccineRepository.findOne.mockResolvedValue(
      baseVaccine({
        storageProvider: VaccineImageStorageProviderId.FAKE,
        storageKey: previousKey,
        originalFilename: 'old.png',
        mimeType: 'image/png',
        sizeBytes: 1000,
        width: 200,
        height: 200,
        validationStatus: VaccineImageValidationStatus.ACCEPTED,
        aiProvider: VaccineImageAiProvider.FAKE,
        aiTags: [],
        aiDetectedText: [],
        uploadedAt: new Date(),
        uploadedByUserId: admin._id,
      }),
    )
    vaccineRepository.findOneAndUpdate.mockResolvedValue(baseVaccine())
    storage.delete.mockRejectedValueOnce(
      Object.assign(new Error('denied'), {
        getResponse: () => ({
          error: 'VACCINE_IMAGE_STORAGE_PERMISSION_DENIED',
        }),
      }),
    )

    const result = await service.uploadOrReplace({
      vaccineId,
      actor: admin,
      bytes: createTestPng(200, 200),
      originalFilename: 'new.png',
      declaredMimeType: 'image/png',
    })

    expect(result.image.validationStatus).toBe(
      VaccineImageValidationStatus.ACCEPTED,
    )
    expect(applicationCache.invalidateVaccines).toHaveBeenCalled()
  })

  it('throws concurrent modification and cleans new blob when race loses', async () => {
    vaccineRepository.findOne.mockResolvedValue(baseVaccine(null))
    vaccineRepository.findOneAndUpdate.mockResolvedValue(null)

    await expect(
      service.uploadOrReplace({
        vaccineId,
        actor: admin,
        bytes: createTestPng(200, 200),
        originalFilename: 'new.png',
        declaredMimeType: 'image/png',
      }),
    ).rejects.toBeInstanceOf(VaccineImageConcurrentModificationException)

    expect(storage.delete).toHaveBeenCalledTimes(1)
  })

  it('delete is idempotent when no image exists', async () => {
    vaccineRepository.findOne.mockResolvedValue(baseVaccine(null))

    const result = await service.deleteImage({ vaccineId, actor: admin })
    expect(result).toEqual({ vaccineId, deleted: false })
    expect(storage.delete).not.toHaveBeenCalled()
  })

  it('delete clears metadata then removes blob', async () => {
    const previousKey = 'vaccines/507f1f77bcf86cd799439011/old.png'
    vaccineRepository.findOne.mockResolvedValue(
      baseVaccine({
        storageProvider: VaccineImageStorageProviderId.FAKE,
        storageKey: previousKey,
        originalFilename: 'old.png',
        mimeType: 'image/png',
        sizeBytes: 1000,
        width: 200,
        height: 200,
        validationStatus: VaccineImageValidationStatus.ACCEPTED,
        aiProvider: VaccineImageAiProvider.FAKE,
        aiTags: [],
        aiDetectedText: [],
        uploadedAt: new Date(),
        uploadedByUserId: admin._id,
      }),
    )
    vaccineRepository.findOneAndUpdate.mockResolvedValue(baseVaccine(null))

    const result = await service.deleteImage({ vaccineId, actor: admin })
    expect(result.deleted).toBe(true)
    expect(storage.delete).toHaveBeenCalledWith(previousKey)
    expect(applicationCache.invalidateVaccines).toHaveBeenCalled()
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: VaccineImageAuditEventType.VACCINE_IMAGE_DELETED,
      }),
    )
  })

  it('override requires an existing image and records actor/timestamp', async () => {
    vaccineRepository.findOne.mockResolvedValue(baseVaccine(null))
    await expect(
      service.overrideValidation({
        vaccineId,
        actor: admin,
        decision: VaccineImageOverrideDecision.ACCEPTED,
        reason: 'Looks fine',
      }),
    ).rejects.toBeInstanceOf(VaccineImageNotPresentException)

    const image: VaccineImage = {
      storageProvider: VaccineImageStorageProviderId.FAKE,
      storageKey: 'vaccines/507f1f77bcf86cd799439011/x.png',
      originalFilename: 'x.png',
      mimeType: 'image/png',
      sizeBytes: 1000,
      width: 200,
      height: 200,
      validationStatus: VaccineImageValidationStatus.REJECTED,
      aiProvider: VaccineImageAiProvider.FAKE,
      aiTags: [],
      aiDetectedText: [],
      uploadedAt: new Date(),
      uploadedByUserId: admin._id,
    }
    vaccineRepository.findOne.mockResolvedValue(baseVaccine(image))
    vaccineRepository.findOneAndUpdate.mockImplementation(
      (_filter: unknown, update: { $set: { image: VaccineImage } }) => {
        return Promise.resolve(baseVaccine(update.$set.image))
      },
    )

    const result = await service.overrideValidation({
      vaccineId,
      actor: admin,
      decision: VaccineImageOverrideDecision.ACCEPTED,
      reason: 'Admin reviewed packaging',
    })

    expect(result.image.validationStatus).toBe(
      VaccineImageValidationStatus.ACCEPTED,
    )
    expect(applicationCache.invalidateVaccines).toHaveBeenCalled()
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: VaccineImageAuditEventType.VACCINE_IMAGE_OVERRIDE_ACCEPTED,
        actorId: admin._id,
        reasonSummary: 'Admin reviewed packaging',
      }),
    )
    const updateCalls = vaccineRepository.findOneAndUpdate.mock
      .calls as unknown as Array<[unknown, { $set: { image: VaccineImage } }]>
    const persisted = updateCalls[0][1].$set.image
    expect(persisted.adminOverride?.overriddenByUserId).toBe(admin._id)
    expect(persisted.adminOverride?.overriddenAt).toBeInstanceOf(Date)
  })
})
