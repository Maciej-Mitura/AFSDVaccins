import type { DecodedIdToken } from 'firebase-admin/auth'

/**
 * Deterministic Bearer tokens for GraphQL E2E.
 * Only Firebase token verification is overridden — guards and Mongo user lookup stay real.
 */
export const E2E_TOKENS = {
  admin: 'e2e-admin',
  apotheker1: 'e2e-apotheker-1',
  apotheker2: 'e2e-apotheker-2',
  bezorger1: 'e2e-bezorger-1',
  bezorger2: 'e2e-bezorger-2',
  /** Valid Firebase identity with no Mongo User row */
  unregistered: 'e2e-unregistered',
} as const

export type E2eToken = (typeof E2E_TOKENS)[keyof typeof E2E_TOKENS]

export type E2eFirebaseIdentity = {
  uid: string
  email: string
  emailVerified: boolean
  displayName?: string
}

export const E2E_IDENTITIES: Record<E2eToken, E2eFirebaseIdentity> = {
  [E2E_TOKENS.admin]: {
    uid: 'e2e-firebase-admin',
    email: 'e2e-admin@example.com',
    emailVerified: true,
    displayName: 'E2E Admin',
  },
  [E2E_TOKENS.apotheker1]: {
    uid: 'e2e-firebase-apotheker-1',
    email: 'e2e-apotheker-1@example.com',
    emailVerified: true,
    displayName: 'E2E Apotheker 1',
  },
  [E2E_TOKENS.apotheker2]: {
    uid: 'e2e-firebase-apotheker-2',
    email: 'e2e-apotheker-2@example.com',
    emailVerified: true,
    displayName: 'E2E Apotheker 2',
  },
  [E2E_TOKENS.bezorger1]: {
    uid: 'e2e-firebase-bezorger-1',
    email: 'e2e-bezorger-1@example.com',
    emailVerified: true,
    displayName: 'E2E Bezorger 1',
  },
  [E2E_TOKENS.bezorger2]: {
    uid: 'e2e-firebase-bezorger-2',
    email: 'e2e-bezorger-2@example.com',
    emailVerified: true,
    displayName: 'E2E Bezorger 2',
  },
  [E2E_TOKENS.unregistered]: {
    uid: 'e2e-firebase-unregistered',
    email: 'e2e-unregistered@example.com',
    emailVerified: true,
    displayName: 'E2E Unregistered',
  },
}

let liveFirebaseCallCount = 0

export function getLiveFirebaseCallCount(): number {
  return liveFirebaseCallCount
}

export function resetLiveFirebaseCallCount(): void {
  liveFirebaseCallCount = 0
}

function toDecodedToken(identity: E2eFirebaseIdentity): DecodedIdToken {
  return {
    uid: identity.uid,
    email: identity.email,
    email_verified: identity.emailVerified,
    name: identity.displayName,
    aud: 'e2e',
    auth_time: 0,
    exp: 0,
    iat: 0,
    iss: 'e2e',
    sub: identity.uid,
    firebase: {
      identities: {},
      sign_in_provider: 'custom',
    },
  }
}

/**
 * Drop-in FirebaseService replacement for E2E — never touches Firebase Admin.
 */
export function createE2eFirebaseService(): {
  getAuth: () => never
  verifyIdToken: (token: string) => Promise<DecodedIdToken>
} {
  return {
    getAuth: () => {
      liveFirebaseCallCount += 1
      throw new Error('Live Firebase Admin must not be used in GraphQL E2E')
    },
    verifyIdToken: (token: string): Promise<DecodedIdToken> => {
      const identity = E2E_IDENTITIES[token as E2eToken]

      if (!identity) {
        const error = new Error('Invalid E2E token') as Error & {
          code: string
        }
        error.code = 'auth/argument-error'
        return Promise.reject(error)
      }

      return Promise.resolve(toDecodedToken(identity))
    },
  }
}
