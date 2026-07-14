import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ExecutionContext } from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'

import { RolesGuard } from './guards/roles.guard'
import { UserRole } from './user-role.enum'
import { User } from './user.entity'
import { UserService } from './user.service'

describe('RolesGuard', () => {
  let guard: RolesGuard
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>
  let userService: jest.Mocked<Pick<UserService, 'requireByFirebaseUid'>>

  const applicationUser: User = {
    _id: '507f1f77bcf86cd799439011',
    id: '507f1f77bcf86cd799439011',
    firebaseUid: 'firebase-uid-123',
    email: 'user@example.com',
    firstName: 'Jan',
    lastName: 'Apotheker',
    role: UserRole.APOTHEKER,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    }
    userService = {
      requireByFirebaseUid: jest.fn(),
    }

    guard = new RolesGuard(
      reflector as unknown as Reflector,
      userService as unknown as UserService,
    )
  })

  function createContext(firebaseUid?: string): ExecutionContext {
    const request: {
      user?: { uid: string; emailVerified: boolean }
      applicationUser?: User
    } = {
      user: firebaseUid ? { uid: firebaseUid, emailVerified: true } : undefined,
    }

    jest.spyOn(GqlExecutionContext, 'create').mockReturnValue({
      getContext: () => ({ req: request }),
    } as unknown as GqlExecutionContext)

    return {
      getHandler: () => jest.fn(),
      getClass: () => class TestClass {},
      getType: () => 'graphql',
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext
  }

  it('throws UnauthorizedException when Firebase identity is missing', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.APOTHEKER])

    await expect(
      guard.canActivate(createContext(undefined)),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('allows matching roles', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.APOTHEKER])
    userService.requireByFirebaseUid.mockResolvedValue(applicationUser)

    await expect(
      guard.canActivate(createContext(applicationUser.firebaseUid)),
    ).resolves.toBe(true)
  })

  it('throws ForbiddenException for mismatched roles', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN])
    userService.requireByFirebaseUid.mockResolvedValue(applicationUser)

    await expect(
      guard.canActivate(createContext(applicationUser.firebaseUid)),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('passes through when no roles are required', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined)

    await expect(
      guard.canActivate(createContext(applicationUser.firebaseUid)),
    ).resolves.toBe(true)
    expect(userService.requireByFirebaseUid).not.toHaveBeenCalled()
  })
})
