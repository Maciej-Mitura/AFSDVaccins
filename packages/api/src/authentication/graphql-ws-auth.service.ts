import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import type { DecodedIdToken } from 'firebase-admin/auth'
import type { FirebaseError } from 'firebase-admin'

import { UserService } from '../user/user.service'
import { UserNotRegisteredException } from '../user/exceptions/user-not-registered.exception'
import {
  AuthenticatedWsContext,
  extractBearerTokenFromConnectionParams,
  GraphqlWsConnectionParams,
} from './graphql-ws-auth.util'
import { FirebaseService } from './firebase.service'

@Injectable()
export class GraphqlWsAuthService {
  private readonly logger = new Logger(GraphqlWsAuthService.name)

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly userService: UserService,
  ) {}

  async authenticateConnection(
    connectionParams: GraphqlWsConnectionParams,
  ): Promise<AuthenticatedWsContext> {
    const token = extractBearerTokenFromConnectionParams(connectionParams)

    if (!token) {
      throw new UnauthorizedException('Missing Authorization connection parameter')
    }

    let decoded: DecodedIdToken

    try {
      decoded = await this.firebaseService.verifyIdToken(token)
    } catch (error: unknown) {
      const firebaseError = error as FirebaseError

      if (firebaseError.code === 'auth/id-token-expired') {
        this.logger.warn('WebSocket connection rejected: expired Firebase token')
      } else if (firebaseError.code === 'auth/id-token-revoked') {
        this.logger.warn('WebSocket connection rejected: revoked Firebase token')
      } else {
        this.logger.warn('WebSocket connection rejected: invalid Firebase token')
      }

      throw new UnauthorizedException('Invalid or expired authentication token')
    }

    const user = {
      uid: decoded.uid,
      email: decoded.email,
      displayName:
        typeof decoded.name === 'string' ? decoded.name : undefined,
      emailVerified: decoded.email_verified ?? false,
    }

    try {
      const applicationUser = await this.userService.requireByFirebaseUid(
        decoded.uid,
      )

      return {
        user,
        applicationUser,
        authorizationHeader: `Bearer ${token}`,
      }
    } catch (error: unknown) {
      if (error instanceof UserNotRegisteredException) {
        this.logger.warn(
          'WebSocket connection rejected: Firebase identity without application user',
        )
        throw new UnauthorizedException('Application user not registered')
      }

      throw error
    }
  }
}
