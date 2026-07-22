import type { DecodedIdToken } from 'firebase-admin/auth'

import {
  E2E_IDENTITIES,
  type E2eToken,
  toE2eDecodedToken,
} from '../../src/authentication/e2e-auth-bypass'

export {
  E2E_IDENTITIES,
  E2E_TOKENS,
  type E2eFirebaseIdentity,
  type E2eToken,
} from '../../src/authentication/e2e-auth-bypass'

let liveFirebaseCallCount = 0

export function getLiveFirebaseCallCount(): number {
  return liveFirebaseCallCount
}

export function resetLiveFirebaseCallCount(): void {
  liveFirebaseCallCount = 0
}

/**
 * Drop-in FirebaseService replacement for Jest GraphQL E2E — never touches Firebase Admin.
 * Playwright browser E2E uses the dual-gate bypass inside FirebaseService instead.
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

      return Promise.resolve(toE2eDecodedToken(identity))
    },
  }
}
