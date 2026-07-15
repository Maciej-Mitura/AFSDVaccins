import { UnauthorizedException } from '@nestjs/common'

import { User } from '../user/user.entity'
import { VerifiedFirebaseIdentity } from './firebase.types'

export type GraphqlWsConnectionParams = Record<string, unknown> | undefined

export function extractBearerTokenFromConnectionParams(
  connectionParams: GraphqlWsConnectionParams,
): string | null {
  if (!connectionParams) {
    return null
  }

  const authorization =
    connectionParams.Authorization ?? connectionParams.authorization

  if (typeof authorization !== 'string' || authorization.trim().length === 0) {
    return null
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i)

  if (!match?.[1]) {
    return null
  }

  return match[1].trim()
}

export type AuthenticatedWsContext = {
  user: VerifiedFirebaseIdentity
  applicationUser: User
  authorizationHeader: string
}

export function buildGraphqlRequestFromWsAuth(
  auth: AuthenticatedWsContext,
): {
  user: VerifiedFirebaseIdentity
  applicationUser: User
  headers: { authorization: string }
} {
  return {
    user: auth.user,
    applicationUser: auth.applicationUser,
    headers: {
      authorization: auth.authorizationHeader,
    },
  }
}

export function rejectWsConnection(reason: string): never {
  throw new UnauthorizedException(reason)
}
