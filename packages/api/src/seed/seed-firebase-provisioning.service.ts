import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { FirebaseService } from '../authentication/firebase.service'
import { EnvConfig } from '../config/env.validation'
import { SeedAccountDefinition } from './seed.accounts'
import { redactUid } from './seed.constants'

export type FirebaseProvisionResult = {
  uid: string
  created: boolean
  reused: boolean
}

function getFirebaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined
  }

  const code: unknown = Reflect.get(error, 'code')
  return typeof code === 'string' ? code : undefined
}

@Injectable()
export class SeedFirebaseProvisioningService {
  private readonly logger = new Logger(SeedFirebaseProvisioningService.name)

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  /**
   * Resolve a Firebase Auth user for a seed account.
   * Override UID (when set) must already exist — never silently retarget another account.
   * Otherwise lookup by email; create only when missing.
   */
  async ensureFirebaseUser(
    account: SeedAccountDefinition,
    password: string,
  ): Promise<FirebaseProvisionResult> {
    const auth = this.firebaseService.getAuth()
    const overrideUid = this.readOptionalUidOverride(account.firebaseUidEnvKey)

    if (overrideUid) {
      try {
        const existing = await auth.getUser(overrideUid)
        this.logger.log(
          `Firebase user reused via UID override for ${account.email} (${redactUid(existing.uid)})`,
        )
        return { uid: existing.uid, created: false, reused: true }
      } catch (error) {
        if (getFirebaseErrorCode(error) === 'auth/user-not-found') {
          throw new Error(
            `Seed Firebase UID override ${account.firebaseUidEnvKey} does not exist. ` +
              `Refusing to create or retarget another account for ${account.email}.`,
          )
        }

        throw error
      }
    }

    try {
      const existing = await auth.getUserByEmail(account.email)
      this.logger.log(
        `Firebase user reused by email for ${account.email} (${redactUid(existing.uid)})`,
      )
      return { uid: existing.uid, created: false, reused: true }
    } catch (error) {
      if (getFirebaseErrorCode(error) !== 'auth/user-not-found') {
        throw error
      }
    }

    const created = await auth.createUser({
      email: account.email,
      password,
      emailVerified: true,
      displayName: `${account.firstName} ${account.lastName}`,
    })

    this.logger.log(
      `Firebase user created for ${account.email} (${redactUid(created.uid)})`,
    )

    return { uid: created.uid, created: true, reused: false }
  }

  private readOptionalUidOverride(envKey: string): string | undefined {
    const value = this.configService.get(envKey as keyof EnvConfig, {
      infer: true,
    })

    if (typeof value !== 'string') {
      return undefined
    }

    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
}
