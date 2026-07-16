import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import {
  BezorgerProfileNotFoundException,
  ProfileForbiddenException,
} from '../exceptions/profile.exceptions'
import { BezorgerProfile } from './bezorger-profile.entity'
import { BezorgerProfileService } from './bezorger-profile.service'

describe('BezorgerProfileService', () => {
  let service: BezorgerProfileService
  let repository: jest.Mocked<
    Pick<MongoRepository<BezorgerProfile>, 'findOne' | 'find' | 'create' | 'save'>
  >

  const userId = '507f1f77bcf86cd799439033'
  const profileId = '607f1f77bcf86cd799439044'

  const bezorger: User = {
    _id: userId,
    id: userId,
    firebaseUid: 'firebase-bezorger',
    email: 'bezorger@example.com',
    firstName: 'Ben',
    lastName: 'Bezorger',
    role: UserRole.BEZORGER,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  const existingProfile: BezorgerProfile = {
    _id: profileId,
    id: profileId,
    userId,
    displayName: 'Ben Bezorger',
    vehicleLabel: 'Van 1',
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
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
        BezorgerProfileService,
        {
          provide: getRepositoryToken(BezorgerProfile),
          useValue: repository,
        },
      ],
    }).compile()

    service = module.get(BezorgerProfileService)
  })

  it('creates a minimal courier profile linked to User.id', async () => {
    repository.findOne.mockResolvedValue(null)
    repository.create.mockImplementation(value => value as BezorgerProfile)
    repository.save.mockImplementation(value =>
      Promise.resolve({
        ...existingProfile,
        ...value,
      } as BezorgerProfile),
    )

    const result = await service.completeOwnProfile(bezorger, {
      displayName: '  Ben Bezorger ',
      vehicleLabel: ' Van 1 ',
    })

    expect(repository.create).toHaveBeenCalledWith({
      userId,
      displayName: 'Ben Bezorger',
      vehicleLabel: 'Van 1',
    })
    expect(result.userId).toBe(userId)
  })

  it('stores null vehicleLabel when omitted or blank', async () => {
    repository.findOne.mockResolvedValue(null)
    repository.create.mockImplementation(value => value as BezorgerProfile)
    repository.save.mockImplementation(value =>
      Promise.resolve({ ...existingProfile, ...value } as BezorgerProfile),
    )

    await service.completeOwnProfile(bezorger, {
      displayName: 'Ben Bezorger',
      vehicleLabel: '   ',
    })

    expect(repository.create).toHaveBeenCalledWith({
      userId,
      displayName: 'Ben Bezorger',
      vehicleLabel: null,
    })
  })

  it('is idempotent on repeated completion', async () => {
    repository.findOne.mockResolvedValue(existingProfile)

    const result = await service.completeOwnProfile(bezorger, {
      displayName: 'Other',
    })

    expect(result).toBe(existingProfile)
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('forbids APOTHEKER from creating bezorger profile', async () => {
    const apothekerUser: User = {
      ...bezorger,
      id: userId,
      role: UserRole.APOTHEKER,
    }

    await expect(
      service.completeOwnProfile(apothekerUser, { displayName: 'X' }),
    ).rejects.toBeInstanceOf(ProfileForbiddenException)
  })

  it('finds profile by userId for future template ownership', async () => {
    repository.findOne.mockResolvedValue(existingProfile)

    await expect(
      service.findBezorgerProfileByUserId(userId),
    ).resolves.toEqual(existingProfile)
  })

  it('maps missing profile on update to BEZORGER_PROFILE_NOT_FOUND', async () => {
    repository.findOne.mockResolvedValue(null)

    await expect(
      service.updateOwnProfile(bezorger, { displayName: 'Updated' }),
    ).rejects.toBeInstanceOf(BezorgerProfileNotFoundException)
  })

  it('lists profiles for ADMIN selection', async () => {
    repository.find.mockResolvedValue([existingProfile])

    await expect(service.listBezorgerProfiles()).resolves.toEqual([
      existingProfile,
    ])
  })
})
