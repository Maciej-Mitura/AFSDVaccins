import { UserRole } from '../user/user-role.enum'
import { User } from '../user/user.entity'
import {
  applyGraphqlWsAuthToContext,
  buildGraphqlContextFromHttp,
  buildGraphqlContextFromWs,
  buildNormalizedGraphqlRequest,
  getApplicationUser,
  isGraphqlWsServerContext,
  resolveNormalizedGraphqlRequest,
} from './graphql-auth.context'
import { GraphqlRequestContext, GraphqlWsContextExtra } from './firebase.types'

describe('graphql-auth.context', () => {
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

  it('detects graphql-ws server context shape', () => {
    expect(
      isGraphqlWsServerContext({
        connectionParams: { Authorization: 'Bearer ws-token' },
        extra: { socket: {}, request: {} },
        subscriptions: {},
      }),
    ).toBe(true)

    expect(
      isGraphqlWsServerContext({
        req: { headers: { authorization: 'Bearer http-token' } },
        res: {},
      }),
    ).toBe(false)
  })

  it('stores authenticated identity on ws extra during onConnect', () => {
    const wsContext: { extra: GraphqlWsContextExtra } = {
      extra: {
        socket: {},
        request: {},
      },
    }

    applyGraphqlWsAuthToContext(wsContext, {
      user: wsAuth.user!,
      applicationUser: wsAuth.applicationUser!,
      headers: {
        authorization: wsAuth.headers?.authorization ?? 'Bearer ws-token',
      },
    })

    expect(wsContext.extra.wsAuth).toEqual(wsAuth)
  })

  it('builds subscription operation context from ws extra.wsAuth', () => {
    const gqlContext = buildGraphqlContextFromWs({
      extra: {
        socket: {},
        request: {},
        wsAuth,
      },
    })

    expect(gqlContext.req.user?.uid).toBe(applicationUser.firebaseUid)
    expect(gqlContext.req.applicationUser?._id).toBe(applicationUser._id)
    expect(gqlContext.req.headers?.authorization).toBe('Bearer ws-token')
  })

  it('does not treat graphql-ws transport extra as authenticated request', () => {
    const gqlContext = buildGraphqlContextFromWs({
      extra: {
        socket: {},
        request: {},
      },
    })

    expect(gqlContext.req.user).toBeUndefined()
    expect(gqlContext.req.applicationUser).toBeUndefined()
  })

  it('resolves application user from normalized ws subscription context', () => {
    const gqlContext: GraphqlRequestContext = {
      req: {
        headers: wsAuth.headers,
        user: wsAuth.user,
        applicationUser: wsAuth.applicationUser,
      },
      extra: {
        socket: {},
        request: {},
        wsAuth,
      },
    }

    expect(getApplicationUser(gqlContext)?._id).toBe(applicationUser._id)
  })

  it('resolves application user from ws extra when req is not yet hydrated', () => {
    const gqlContext: GraphqlRequestContext = {
      req: {},
      extra: {
        socket: {},
        request: {},
        wsAuth,
      },
    }

    expect(resolveNormalizedGraphqlRequest(gqlContext)).toEqual(wsAuth)
    expect(getApplicationUser(gqlContext)?._id).toBe(applicationUser._id)
  })

  it('keeps HTTP context unchanged', () => {
    const httpContext = buildGraphqlContextFromHttp({
      req: {
        headers: { authorization: 'Bearer http-token' },
        user: wsAuth.user,
        applicationUser: wsAuth.applicationUser,
      },
      res: {},
    })

    expect(httpContext.req.applicationUser?._id).toBe(applicationUser._id)
  })
})
