import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { FindOptionsWhere, MongoRepository } from 'typeorm'

import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import {
  ApothekerProfileNotFoundException,
  ProfileForbiddenException,
  ProfileInvalidException,
} from '../exceptions/profile.exceptions'
import { ApothekerProfile } from './apotheker-profile.entity'
import { ApothekerProfileService } from './apotheker-profile.service'

describe('ApothekerProfileService', () => {
  let service: ApothekerProfileService
  let repository: jest.Mocked<
    Pick<MongoRepository<ApothekerProfile>, 'findOne' | 'find' | 'create' | 'save'>
  >

  const userId = '507f1f77bcf86cd799439011'
  const profileId = '607f1f77bcf86cd799439022'

  const apotheker: User = {
    _id: userId,
    id: userId,
    firebaseUid: 'firebase-apotheker',
    email: 'apotheker@example.com',
    firstName: 'Ann',
    lastName: 'Apotheker',
    role: UserRole.APOTHEKER,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  const validAddress = {
    street: 'Kerkstraat',
    houseNumber: '12',
    postalCode: '8000',
    city: 'Brugge',
    country: 'BE',
  }

  const existingProfile: ApothekerProfile = {
    _id: profileId,
    id: profileId,
    userId,
    pharmacyName: 'Apotheek Centrum',
    address: validAddress,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  function matchesUserIdLookup(
    options: Parameters<MongoRepository<ApothekerProfile>['findOne']>[0],
    id: string,
  ): boolean {
    const where = options?.where

    if (!where || Array.isArray(where)) {
      return false
    }

    return (where as FindOptionsWhere<ApothekerProfile>).userId === id
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
        ApothekerProfileService,
        {
          provide: getRepositoryToken(ApothekerProfile),
          useValue: repository,
        },
      ],
    }).compile()

    service = module.get(ApothekerProfileService)
  })

  it('creates a valid pharmacy profile linked to User.id', async () => {
    repository.findOne.mockResolvedValue(null)
    repository.create.mockImplementation(value => value as ApothekerProfile)
    repository.save.mockImplementation(value =>
      Promise.resolve({
        ...existingProfile,
        ...value,
        _id: profileId,
      } as ApothekerProfile),
    )

    const result = await service.completeOwnProfile(apotheker, {
      pharmacyName: '  Apotheek Centrum ',
      address: {
        street: '  Kerkstraat ',
        houseNumber: ' 12 ',
        postalCode: '8000',
        city: ' Brugge ',
      },
    })

    expect(repository.create).toHaveBeenCalledWith({
      userId,
      pharmacyName: 'Apotheek Centrum',
      address: validAddress,
    })
    expect(result.userId).toBe(userId)
    expect(result.address.country).toBe('BE')
  })

  it('rejects missing pharmacy name', async () => {
    repository.findOne.mockResolvedValue(null)

    await expect(
      service.completeOwnProfile(apotheker, {
        pharmacyName: '   ',
        address: validAddress,
      }),
    ).rejects.toBeInstanceOf(ProfileInvalidException)
  })

  it('defaults country to BE when omitted', async () => {
    repository.findOne.mockResolvedValue(null)
    repository.create.mockImplementation(value => value as ApothekerProfile)
    repository.save.mockImplementation(value =>
      Promise.resolve({ ...existingProfile, ...value } as ApothekerProfile),
    )

    await service.completeOwnProfile(apotheker, {
      pharmacyName: 'Apotheek Centrum',
      address: {
        street: 'Kerkstraat',
        houseNumber: '12',
        postalCode: '8000',
        city: 'Brugge',
      },
    })

    const created = repository.create.mock.calls[0]?.[0] as {
      address: { country: string }
    }

    expect(created.address.country).toBe('BE')
  })

  it('returns existing profile idempotently on repeated completion', async () => {
    repository.findOne.mockResolvedValue(existingProfile)

    const first = await service.completeOwnProfile(apotheker, {
      pharmacyName: 'Other Name',
      address: validAddress,
    })
    const second = await service.completeOwnProfile(apotheker, {
      pharmacyName: 'Other Name',
      address: validAddress,
    })

    expect(first).toBe(existingProfile)
    expect(second).toBe(existingProfile)
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('forbids BEZORGER from creating apotheker profile', async () => {
    const bezorgerUser: User = {
      ...apotheker,
      id: userId,
      role: UserRole.BEZORGER,
    }

    await expect(
      service.completeOwnProfile(bezorgerUser, {
        pharmacyName: 'X',
        address: validAddress,
      }),
    ).rejects.toBeInstanceOf(ProfileForbiddenException)
  })

  it('forbids ADMIN from creating apotheker profile', async () => {
    const adminUser: User = {
      ...apotheker,
      id: userId,
      role: UserRole.ADMIN,
    }

    await expect(
      service.completeOwnProfile(adminUser, {
        pharmacyName: 'X',
        address: validAddress,
      }),
    ).rejects.toBeInstanceOf(ProfileForbiddenException)
  })

  it('updates own pharmacy name and address', async () => {
    repository.findOne.mockResolvedValue({
      ...existingProfile,
      id: profileId,
    })
    repository.save.mockImplementation(value =>
      Promise.resolve(value as ApothekerProfile),
    )

    const result = await service.updateOwnProfile(apotheker, {
      pharmacyName: ' Apotheek Noord ',
      address: {
        street: 'Nieuwstraat',
        houseNumber: '1',
        postalCode: '9000',
        city: 'Gent',
        country: 'be',
      },
    })

    expect(result.pharmacyName).toBe('Apotheek Noord')
    expect(result.address).toEqual({
      street: 'Nieuwstraat',
      houseNumber: '1',
      postalCode: '9000',
      city: 'Gent',
      country: 'BE',
    })
  })

  it('finds profile by GraphQL id and by userId for order bridge', async () => {
    repository.findOne.mockImplementation(options => {
      const where = options?.where as FindOptionsWhere<ApothekerProfile>

      if (where?._id instanceof ObjectId && where._id.toString() === profileId) {
        return Promise.resolve(existingProfile)
      }

      if (matchesUserIdLookup(options, userId)) {
        return Promise.resolve(existingProfile)
      }

      return Promise.resolve(null)
    })

    const byId = await service.findApothekerProfileById(profileId)
    const byUser = await service.findApothekerProfileByUserId(userId)

    expect(byId.userId).toBe(userId)
    expect(byUser?.id).toBe(profileId)
  })

  it('maps malformed id to APOTHEKER_PROFILE_NOT_FOUND', async () => {
    await expect(service.findApothekerProfileById('not-an-id')).rejects.toBeInstanceOf(
      ApothekerProfileNotFoundException,
    )
  })

  it('lists profiles for ADMIN selection', async () => {
    repository.find.mockResolvedValue([existingProfile])

    await expect(service.listApothekerProfiles()).resolves.toEqual([
      existingProfile,
    ])
    expect(repository.find).toHaveBeenCalledWith({
      order: { pharmacyName: 'ASC' },
    })
  })

  it('does not forge userId from client input', async () => {
    repository.findOne.mockResolvedValue(null)
    repository.create.mockImplementation(value => value as ApothekerProfile)
    repository.save.mockImplementation(value =>
      Promise.resolve({ ...existingProfile, ...value } as ApothekerProfile),
    )

    await service.completeOwnProfile(apotheker, {
      pharmacyName: 'Apotheek Centrum',
      address: validAddress,
    })

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId }),
    )
    expect(repository.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'forged-id' }),
    )
  })
})
