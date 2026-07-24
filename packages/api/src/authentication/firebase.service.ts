import { Injectable, Logger } from '@nestjs/common'
import { App, initializeApp } from 'firebase-admin/app'
import { Auth, DecodedIdToken, getAuth } from 'firebase-admin/auth'

import {
  isE2eAuthBypassEnabled,
  verifyE2eBypassToken,
} from './e2e-auth-bypass'
import { resolveFirebaseAdminCredential } from './firebase-credentials'

const skipFirebaseInit =
  process.argv.includes('--generate-schema-only') ||
  process.env.GENERATE_SCHEMA_ONLY === 'true'

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name)
  private firebaseApp: App | null = null
  private auth: Auth | null = null

  constructor() {
    if (skipFirebaseInit || process.env.NODE_ENV === 'test') {
      return
    }

    const resolved = resolveFirebaseAdminCredential(process.env)

    this.firebaseApp = initializeApp({
      credential: resolved.credential,
    })
    this.auth = getAuth(this.firebaseApp)
    this.logger.log(
      `Firebase Admin SDK initialized (credential source: ${resolved.source})`,
    )
  }

  getAuth(): Auth {
    if (!this.auth) {
      throw new Error('Firebase Admin SDK is not initialized')
    }

    return this.auth
  }

  async verifyIdToken(idToken: string): Promise<DecodedIdToken> {
    if (isE2eAuthBypassEnabled()) {
      return verifyE2eBypassToken(idToken)
    }

    return this.getAuth().verifyIdToken(idToken, false)
  }
}
