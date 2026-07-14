import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy } from 'passport-http-bearer'
import type { FirebaseError } from 'firebase-admin'
import type { DecodedIdToken } from 'firebase-admin/auth'

import { FirebaseService } from './firebase.service'
import { VerifiedFirebaseIdentity } from './firebase.types'

export const FIREBASE_AUTH_STRATEGY = 'firebase-auth'

@Injectable()
export class FirebaseAuthStrategy extends PassportStrategy(
  Strategy,
  FIREBASE_AUTH_STRATEGY,
) {
  private readonly logger = new Logger(FirebaseAuthStrategy.name)

  constructor(private readonly firebaseService: FirebaseService) {
    super()
  }

  async validate(token: string): Promise<VerifiedFirebaseIdentity> {
    try {
      const decoded: DecodedIdToken =
        await this.firebaseService.verifyIdToken(token)

      return {
        uid: decoded.uid,
        email: decoded.email,
        displayName:
          typeof decoded.name === 'string' ? decoded.name : undefined,
        emailVerified: decoded.email_verified ?? false,
      }
    } catch (error: unknown) {
      const firebaseError = error as FirebaseError

      if (firebaseError.code === 'auth/id-token-expired') {
        this.logger.warn('Firebase ID token expired')
      } else if (firebaseError.code === 'auth/id-token-revoked') {
        this.logger.warn('Firebase ID token revoked')
      } else {
        this.logger.error('Firebase token verification failed', firebaseError)
      }

      throw new UnauthorizedException()
    }
  }
}
