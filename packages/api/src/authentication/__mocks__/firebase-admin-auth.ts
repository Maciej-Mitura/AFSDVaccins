export const getAuth = jest.fn()

export type Auth = {
  verifyIdToken: jest.Mock
}

export type DecodedIdToken = {
  uid: string
  email?: string
  email_verified?: boolean
  name?: string
  aud: string
  auth_time: number
  exp: number
  firebase: {
    identities: Record<string, unknown>
    sign_in_provider: string
  }
  iat: number
  iss: string
  sub: string
}
