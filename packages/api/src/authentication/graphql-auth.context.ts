import { ExecutionContext } from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'

import { User } from '../user/user.entity'
import {
  GraphqlRequestContext,
  GraphqlWsContextExtra,
  NormalizedGraphqlRequest,
  VerifiedFirebaseIdentity,
} from './firebase.types'

export function isGraphqlWsServerContext(
  value: unknown,
): value is {
  connectionParams?: Readonly<Record<string, unknown>>
  extra?: GraphqlWsContextExtra
  subscriptions?: Record<string, unknown>
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'extra' in value &&
    ('connectionParams' in value || 'subscriptions' in value)
  )
}

export function buildNormalizedGraphqlRequest(auth: {
  user: VerifiedFirebaseIdentity
  applicationUser: User
  headers: { authorization: string }
}): NormalizedGraphqlRequest {
  return {
    user: auth.user,
    applicationUser: auth.applicationUser,
    headers: auth.headers,
  }
}

export function resolveNormalizedGraphqlRequest(
  context: GraphqlRequestContext,
): NormalizedGraphqlRequest | null {
  if (context.req?.applicationUser) {
    return {
      user: context.req.user,
      applicationUser: context.req.applicationUser,
      headers: context.req.headers,
    }
  }

  const wsAuth = context.extra?.wsAuth

  if (wsAuth?.applicationUser) {
    return wsAuth
  }

  if (context.req?.user?.uid) {
    return {
      user: context.req.user,
      applicationUser: context.req.applicationUser,
      headers: context.req.headers,
    }
  }

  return null
}

export function syncAuthToRequest(
  context: GraphqlRequestContext,
  normalized: NormalizedGraphqlRequest | null,
): void {
  if (!normalized?.user?.uid) {
    return
  }

  context.req.user = normalized.user
  context.req.applicationUser = normalized.applicationUser
  context.req.headers = {
    ...context.req.headers,
    ...normalized.headers,
  }
}

export function getGraphqlRequestContext(
  context: ExecutionContext,
): GraphqlRequestContext {
  return GqlExecutionContext.create(context).getContext<GraphqlRequestContext>()
}

export function getApplicationUser(
  context: GraphqlRequestContext,
): User | null {
  return resolveNormalizedGraphqlRequest(context)?.applicationUser ?? null
}

export function applyGraphqlWsAuthToContext(
  wsContext: {
    extra: GraphqlWsContextExtra
  },
  auth: {
    user: VerifiedFirebaseIdentity
    applicationUser: User
    headers: { authorization: string }
  },
): void {
  wsContext.extra.wsAuth = buildNormalizedGraphqlRequest(auth)
}

export function buildGraphqlContextFromWs(wsContext: {
  extra?: GraphqlWsContextExtra
}): GraphqlRequestContext {
  const wsAuth = wsContext.extra?.wsAuth

  if (!wsAuth) {
    return { req: {}, extra: wsContext.extra }
  }

  return {
    req: {
      headers: wsAuth.headers,
      user: wsAuth.user,
      applicationUser: wsAuth.applicationUser,
    },
    extra: wsContext.extra,
  }
}

export function buildGraphqlContextFromHttp(
  httpContext: unknown,
): GraphqlRequestContext {
  const value = httpContext as {
    req?: NormalizedGraphqlRequest
    res?: unknown
  }

  if (value.req) {
    return {
      req: value.req,
      res: value.res,
    }
  }

  return {
    req: httpContext as NormalizedGraphqlRequest,
    res: undefined,
  }
}
