import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { FindOptionsWhere, MongoRepository } from 'typeorm'

import { ApplicationCacheService } from '../../common/cache/application-cache.service'
import { UserRole } from '../../user/user-role.enum'
import { Vaccine } from '../vaccine.entity'
import { VaccineService } from '../vaccine.service'
import { VaccineImageAiProvider } from './vaccine-image-ai-provider.enum'
import { VaccineImageStorageProviderId } from './vaccine-image-storage-provider.enum'
import { VaccineImageValidationStatus } from './vaccine-image-validation-status.enum'
import { VaccineImage } from './vaccine-image.embed'
import { assertValidVaccineImage } from './vaccine-image.validation'

describe('Vaccine optional image compatibility', () => {
  let service: VaccineService
  let repository: jest.Mocked<
    Pick<MongoRepository<Vaccine>, 'findOne' | 'find' | 'create' | 'save'>
  >

  const vaccineId = '507f1f77bcf86cd799439011'

  const image: VaccineImage = assertValidVaccineImage({
    storageProvider: VaccineImageStorageProviderId.AZURE_BLOB,
    storageKey: 'vaccines/507f/image.jpg',
    originalFilename: 'image.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 2048,
    width: 400,
    height: 300,
    validationStatus: VaccineImageValidationStatus.ACCEPTED,
    aiProvider: VaccineImageAiProvider.AZURE_VISION_4,
    aiCaption: 'Vaccine vial',
    aiConfidence: 0.88,
    aiTags: ['vaccine'],
    aiDetectedText: [],
    uploadedAt: new Date('2026-07-25T11:00:00.000Z'),
    uploadedByUserId: '507f1f77bcf86cd799439099',
  })

  const vaccineWithoutImage: Vaccine = {
    _id: vaccineId,
    id: vaccineId,
    name: 'Influenza',
    normalizedName: 'influenza',
    description: 'Seasonal flu vaccine',
    manufacturer: 'PharmaCo',
    stockQuantity: 10,
    stockWarningThreshold: 5,
    active: true,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  function matchesObjectIdLookup(
    options: Parameters<MongoRepository<Vaccine>['findOne']>[0],
    id: string,
  ): boolean {
    const where = options?.where

    if (!where || Array.isArray(where)) {
      return false
    }

    const lookupId = (where as FindOptionsWhere<Vaccine>)._id
    return lookupId instanceof ObjectId && lookupId.toString() === id
  }

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaccineService,
        {
          provide: getRepositoryToken(Vaccine),
          useValue: repository,
        },
        {
          provide: ApplicationCacheService,
          useValue: {
            getOrSet: jest.fn(
              async (_key: string, loader: () => Promise<unknown>) => loader(),
            ),
            invalidateVaccines: jest.fn().mockResolvedValue(undefined),
            referenceTtlMs: jest.fn().mockReturnValue(60_000),
          },
        },
      ],
    }).compile()

    service = module.get(VaccineService)
  })

  it('reads existing vaccines without an image property', async () => {
    repository.findOne.mockImplementation(options =>
      Promise.resolve(
        matchesObjectIdLookup(options, vaccineId) ? vaccineWithoutImage : null,
      ),
    )

    const result = await service.findVaccineById(vaccineId, UserRole.ADMIN)
    expect(result.image).toBeUndefined()
    expect(result.name).toBe('Influenza')
  })

  it('persists and reads valid image metadata on a vaccine', async () => {
    const withImage: Vaccine = {
      ...vaccineWithoutImage,
      id: vaccineId,
      image,
    }

    repository.findOne.mockImplementation(options =>
      Promise.resolve(
        matchesObjectIdLookup(options, vaccineId) ? withImage : null,
      ),
    )

    const result = await service.findVaccineById(vaccineId, UserRole.ADMIN)
    expect(result.image).toEqual(image)
    expect(result.image?.storageKey).toBe('vaccines/507f/image.jpg')
    expect(result.image?.validationStatus).toBe(
      VaccineImageValidationStatus.ACCEPTED,
    )
  })
})
