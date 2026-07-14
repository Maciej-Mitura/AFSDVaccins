import { UnauthorizedException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { DecodedIdToken } from 'firebase-admin/auth'

import { FirebaseAuthStrategy } from './firebase-auth.strategy'
import { FirebaseService } from './firebase.service'

describe('FirebaseAuthStrategy', () => {
  let strategy: FirebaseAuthStrategy

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

  const firebaseServiceMock = {
    verifyIdToken: jest.fn(),
  }

  beforeEach(async () => {
    firebaseServiceMock.verifyIdToken.mockReset()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FirebaseAuthStrategy,
        {
          provide: FirebaseService,
          useValue: firebaseServiceMock,
        },
      ],
    }).compile()

    strategy = module.get(FirebaseAuthStrategy)
  })

  it('accepts a valid token and returns a safe identity', async () => {
    firebaseServiceMock.verifyIdToken.mockResolvedValue(mockDecodedToken)

    await expect(strategy.validate('valid-token')).resolves.toEqual({
      uid: 'firebase-uid-123',
      email: 'user@example.com',
      displayName: 'Test User',
      emailVerified: true,
    })
  })

  it('throws UnauthorizedException for an invalid token', async () => {
    firebaseServiceMock.verifyIdToken.mockRejectedValue({
      code: 'auth/argument-error',
    })

    await expect(strategy.validate('invalid-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })
})
