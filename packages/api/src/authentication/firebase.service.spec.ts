import { Test, TestingModule } from '@nestjs/testing'
import { DecodedIdToken } from 'firebase-admin/auth'

import { FirebaseService } from './firebase.service'

describe('FirebaseService', () => {
  const mockDecodedToken: DecodedIdToken = {
    uid: 'firebase-uid-123',
    email: 'user@example.com',
    email_verified: true,
    name: 'Test User',
    aud: 'project-id',
    auth_time: 1,
    exp: 9999999999,
    firebase: {
      identities: {},
      sign_in_provider: 'password',
    },
    iat: 1,
    iss: 'https://securetoken.google.com/project-id',
    sub: 'firebase-uid-123',
  }

  const verifyIdToken = jest.fn<Promise<DecodedIdToken>, [string]>()

  beforeEach(() => {
    verifyIdToken.mockReset()
    verifyIdToken.mockResolvedValue(mockDecodedToken)
  })

  it('verifies a valid ID token through the mocked provider', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: FirebaseService,
          useValue: { verifyIdToken, getAuth: jest.fn() },
        },
      ],
    }).compile()

    const service = module.get(FirebaseService)

    const result = await service.verifyIdToken('valid-token')

    expect(result).toEqual(mockDecodedToken)
    expect(verifyIdToken).toHaveBeenCalledWith('valid-token')
  })

  it('propagates verification failures from the mocked provider', async () => {
    verifyIdToken.mockRejectedValue(new Error('invalid token'))

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: FirebaseService,
          useValue: { verifyIdToken, getAuth: jest.fn() },
        },
      ],
    }).compile()

    const service = module.get(FirebaseService)

    await expect(service.verifyIdToken('invalid-token')).rejects.toThrow(
      'invalid token',
    )
  })
})

describe('FirebaseService initialization', () => {
  const originalEnv = process.env

  afterEach(() => {
    process.env = originalEnv
  })

  it('skips Admin SDK initialization in test environment', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
    }

    expect(() => new FirebaseService()).not.toThrow()
  })
})
