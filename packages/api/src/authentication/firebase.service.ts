import { Injectable, Logger } from '@nestjs/common'
import { App, applicationDefault, initializeApp } from 'firebase-admin/app'
import { Auth, DecodedIdToken, getAuth } from 'firebase-admin/auth'

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

    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      throw new Error(
        'GOOGLE_APPLICATION_CREDENTIALS is required when Firebase Admin is enabled',
      )
    }

    this.firebaseApp = initializeApp({
      credential: applicationDefault(),
    })
    this.auth = getAuth(this.firebaseApp)
    this.logger.log('Firebase Admin SDK initialized')
  }

  getAuth(): Auth {
    if (!this.auth) {
      throw new Error('Firebase Admin SDK is not initialized')
    }

    return this.auth
  }

  async verifyIdToken(idToken: string): Promise<DecodedIdToken> {
    return this.getAuth().verifyIdToken(idToken, false)
  }
}
