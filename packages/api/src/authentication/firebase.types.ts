export type VerifiedFirebaseIdentity = {
  uid: string
  email?: string
  displayName?: string
  emailVerified: boolean
}

export type GraphqlRequestContext = {
  req: {
    user?: VerifiedFirebaseIdentity
    applicationUser?: import('../user/user.entity').User
    headers?: {
      authorization?: string
    }
  }
}
