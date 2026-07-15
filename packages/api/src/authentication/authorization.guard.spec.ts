import { ExecutionContext } from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'

import { UserRole } from '../user/user-role.enum'
import { User } from '../user/user.entity'
import { AuthorizationGuard } from './authorization.guard'
import { GraphqlRequestContext } from './firebase.types'
import { buildNormalizedGraphqlRequest } from './graphql-auth.context'

describe('AuthorizationGuard', () => {
  const applicationUser: User = {
    _id: '507f1f77bcf86cd799439011',
    id: '507f1f77bcf86cd799439011',
    firebaseUid: 'firebase-a',
    email: 'a@example.com',
    firstName: 'A',
    lastName: 'Apotheker',
    role: UserRole.APOTHEKER,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  const guard = new AuthorizationGuard()

  function createWsSubscriptionContext(): {
    context: ExecutionContext
    gqlContext: GraphqlRequestContext
  } {
    const wsAuth = buildNormalizedGraphqlRequest({
      user: {
        uid: applicationUser.firebaseUid,
        email: applicationUser.email,
        emailVerified: true,
      },
      applicationUser,
      headers: {
        authorization: 'Bearer ws-token',
      },
    })

    const gqlContext: GraphqlRequestContext = {
      req: {},
      extra: {
        socket: {},
        request: {},
        wsAuth,
      },
    }

    jest.spyOn(GqlExecutionContext, 'create').mockReturnValue({
      getContext: () => gqlContext,
    } as unknown as GqlExecutionContext)

    return {
      context: {
        getHandler: () => jest.fn(),
        getClass: () => class TestClass {},
        getType: () => 'graphql',
      } as unknown as ExecutionContext,
      gqlContext,
    }
  }

  it('accepts pre-authenticated graphql-ws subscription context without Passport', async () => {
    const { context, gqlContext } = createWsSubscriptionContext()

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(gqlContext.req.user?.uid).toBe(applicationUser.firebaseUid)
    expect(gqlContext.req.applicationUser?._id).toBe(applicationUser._id)
    expect(gqlContext.req.headers?.authorization).toBe('Bearer ws-token')
  })
})
