import { UnauthorizedException } from '@nestjs/common'

import { UserNotRegisteredException } from '../user/exceptions/user-not-registered.exception'
import { UserRole } from '../user/user-role.enum'
import { User } from '../user/user.entity'
import { GraphqlWsAuthService } from './graphql-ws-auth.service'
import { FirebaseService } from './firebase.service'
import { UserService } from '../user/user.service'

describe('GraphqlWsAuthService', () => {
  let service: GraphqlWsAuthService
  let firebaseService: jest.Mocked<Pick<FirebaseService, 'verifyIdToken'>>
  let userService: jest.Mocked<Pick<UserService, 'requireByFirebaseUid'>>

  const applicationUser: User = {
    _id: '507f1f77bcf86cd799439011',
    id: '507f1f77bcf86cd799439011',
    firebaseUid: 'firebase-apotheker',
    email: 'apotheker@example.com',
    firstName: 'Jan',
    lastName: 'Apotheker',
    role: UserRole.APOTHEKER,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  beforeEach(() => {
    firebaseService = {
      verifyIdToken: jest.fn(),
    }
    userService = {
      requireByFirebaseUid: jest.fn(),
    }

    service = new GraphqlWsAuthService(
      firebaseService as unknown as FirebaseService,
      userService as unknown as UserService,
    )
  })

  it('accepts a valid Firebase token and application user', async () => {
    firebaseService.verifyIdToken.mockResolvedValue({
      uid: 'firebase-apotheker',
      email: 'apotheker@example.com',
      email_verified: true,
    } as never)
    userService.requireByFirebaseUid.mockResolvedValue(applicationUser)

    const result = await service.authenticateConnection({
      Authorization: 'Bearer valid-token',
    })

    expect(result.applicationUser).toEqual(applicationUser)
    expect(result.authorizationHeader).toBe('Bearer valid-token')
  })

  it('rejects missing Authorization connection parameter', async () => {
    await expect(service.authenticateConnection({})).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })

  it('rejects invalid Firebase tokens safely', async () => {
    firebaseService.verifyIdToken.mockRejectedValue(new Error('invalid token'))

    await expect(
      service.authenticateConnection({
        Authorization: 'Bearer invalid-token',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('rejects Firebase identity without application user', async () => {
    firebaseService.verifyIdToken.mockResolvedValue({
      uid: 'firebase-unknown',
      email: 'unknown@example.com',
      email_verified: true,
    } as never)
    userService.requireByFirebaseUid.mockRejectedValue(
      new UserNotRegisteredException(),
    )

    await expect(
      service.authenticateConnection({
        Authorization: 'Bearer valid-token',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })
})
