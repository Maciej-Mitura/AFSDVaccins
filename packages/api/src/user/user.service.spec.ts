import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { VerifiedFirebaseIdentity } from '../authentication/firebase.types'
import { CreateOwnUserInput } from './dto/create-own-user.input'
import { UpdateOwnUserInput } from './dto/update-own-user.input'
import { FirebaseEmailMissingException } from './exceptions/firebase-email-missing.exception'
import { UserNotRegisteredException } from './exceptions/user-not-registered.exception'
import { UserRole } from './user-role.enum'
import { User } from './user.entity'
import { UserService } from './user.service'

describe('UserService', () => {
  let service: UserService
  let repository: jest.Mocked<
    Pick<MongoRepository<User>, 'findOne' | 'create' | 'save'>
  >

  const identity: VerifiedFirebaseIdentity = {
    uid: 'firebase-uid-123',
    email: 'User@Example.com',
    emailVerified: true,
  }

  const existingUser: User = {
    _id: '507f1f77bcf86cd799439011',
    id: '507f1f77bcf86cd799439011',
    firebaseUid: identity.uid,
    email: 'user@example.com',
    firstName: 'Jan',
    lastName: 'Apotheker',
    role: UserRole.APOTHEKER,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: repository,
        },
      ],
    }).compile()

    service = module.get(UserService)
  })

  it('normalizes email addresses', () => {
    expect(service.normalizeEmail('  User@Example.com ')).toBe(
      'user@example.com',
    )
  })

  it('creates an APOTHEKER for a new Firebase identity', async () => {
    repository.findOne.mockResolvedValue(null)
    repository.create.mockImplementation(value => value as User)
    repository.save.mockImplementation(value =>
      Promise.resolve({
        ...existingUser,
        ...value,
      } as User),
    )

    const input: CreateOwnUserInput = {
      firstName: 'Jan',
      lastName: 'Apotheker',
    }

    const result = await service.createOwnUser(identity, input)

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        firebaseUid: identity.uid,
        email: 'user@example.com',
        firstName: 'Jan',
        lastName: 'Apotheker',
        role: UserRole.APOTHEKER,
      }),
    )
    expect(result.role).toBe(UserRole.APOTHEKER)
  })

  it('returns the existing user for duplicate firebaseUid submissions', async () => {
    repository.findOne.mockResolvedValue(existingUser)

    const result = await service.createOwnUser(identity, {
      firstName: 'Other',
      lastName: 'Name',
    })

    expect(result).toEqual(existingUser)
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('throws when Firebase identity has no email', async () => {
    repository.findOne.mockResolvedValue(null)

    await expect(
      service.createOwnUser(
        { uid: 'uid' },
        {
          firstName: 'Jan',
          lastName: 'Apotheker',
        },
      ),
    ).rejects.toBeInstanceOf(FirebaseEmailMissingException)
  })

  it('resolves currentUser by firebaseUid', async () => {
    repository.findOne.mockResolvedValue(existingUser)

    await expect(service.requireByFirebaseUid(identity.uid)).resolves.toEqual(
      existingUser,
    )
  })

  it('throws USER_NOT_REGISTERED when no application user exists', async () => {
    repository.findOne.mockResolvedValue(null)

    await expect(
      service.requireByFirebaseUid(identity.uid),
    ).rejects.toBeInstanceOf(UserNotRegisteredException)
  })

  it('updates only approved profile fields', async () => {
    repository.findOne.mockResolvedValue({ ...existingUser } as User)
    repository.save.mockImplementation(value => Promise.resolve(value as User))

    const input: UpdateOwnUserInput = {
      firstName: 'Marie',
      lastName: 'Updated',
    }

    const result = await service.updateOwnUser(identity.uid, input)

    expect(result.firstName).toBe('Marie')
    expect(result.lastName).toBe('Updated')
    expect(result.role).toBe(UserRole.APOTHEKER)
    expect(result.email).toBe('user@example.com')
    expect(result.firebaseUid).toBe(identity.uid)
  })
})
