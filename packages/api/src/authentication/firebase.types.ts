import { User } from '../user/user.entity'

export type VerifiedFirebaseIdentity = {
  uid: string
  email?: string
  displayName?: string
  emailVerified: boolean
}

export type NormalizedGraphqlRequest = {
  user?: VerifiedFirebaseIdentity
  applicationUser?: User
  headers?: {
    authorization?: string
  }
}

export type GraphqlWsContextExtra = {
  wsAuth?: NormalizedGraphqlRequest
  socket?: unknown
  request?: unknown
}

export type GraphqlRequestContext = {
  req: NormalizedGraphqlRequest
  res?: unknown
  extra?: GraphqlWsContextExtra
}
