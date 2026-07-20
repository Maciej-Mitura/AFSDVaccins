import { ConfigService } from '@nestjs/config'

import { FirebaseService } from '../authentication/firebase.service'
import { EnvConfig } from '../config/env.validation'
import { UserRole } from '../user/user-role.enum'
import { SeedFirebaseProvisioningService } from './seed-firebase-provisioning.service'
import { redactUid } from './seed.constants'

describe('redactUid', () => {
  it('does not print full Firebase UIDs', () => {
    const uid = 'abcdefghijklmnopqrstuvwxyz'
    const redacted = redactUid(uid)
    expect(redacted).not.toBe(uid)
    expect(redacted.includes('…')).toBe(true)
  })
})

describe('SeedFirebaseProvisioningService', () => {
  function buildService(env: Partial<EnvConfig> = {}) {
    const getUser = jest.fn()
    const getUserByEmail = jest.fn()
    const createUser = jest.fn()

    const firebaseService = {
      getAuth: () => ({
        getUser,
        getUserByEmail,
        createUser,
      }),
    } as unknown as FirebaseService

    const configService = {
      get: (key: keyof EnvConfig) => env[key],
    } as ConfigService<EnvConfig, true>

    const service = new SeedFirebaseProvisioningService(
      firebaseService,
      configService,
    )

    return { service, getUser, getUserByEmail, createUser }
  }

  const account = {
    key: 'docent' as const,
    email: 'docent@howest.be',
    role: UserRole.ADMIN,
    firstName: 'Docent',
    lastName: 'Howest',
    firebaseUidEnvKey: 'SEED_DOCENT_FIREBASE_UID',
  }

  it('reuses Firebase user by email without creating', async () => {
    const { service, getUserByEmail, createUser } = buildService()
    getUserByEmail.mockResolvedValue({ uid: 'existing-uid-12345678' })

    const result = await service.ensureFirebaseUser(account, 'demo-password')

    expect(result).toEqual({
      uid: 'existing-uid-12345678',
      created: false,
      reused: true,
    })
    expect(createUser).not.toHaveBeenCalled()
  })

  it('creates Firebase user only when email is missing', async () => {
    const { service, getUserByEmail, createUser } = buildService()
    getUserByEmail.mockRejectedValue({ code: 'auth/user-not-found' })
    createUser.mockResolvedValue({ uid: 'created-uid-abcdefgh' })

    const result = await service.ensureFirebaseUser(account, 'demo-password')

    expect(result.created).toBe(true)
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: account.email,
        password: 'demo-password',
        emailVerified: true,
      }),
    )
  })

  it('reuses override UID without createUser', async () => {
    const { service, getUser, createUser, getUserByEmail } = buildService({
      SEED_DOCENT_FIREBASE_UID: 'override-uid-xyz',
    })
    getUser.mockResolvedValue({ uid: 'override-uid-xyz' })

    const result = await service.ensureFirebaseUser(account, 'demo-password')

    expect(result.reused).toBe(true)
    expect(createUser).not.toHaveBeenCalled()
    expect(getUserByEmail).not.toHaveBeenCalled()
  })

  it('refuses missing override UID instead of creating another account', async () => {
    const { service, getUser, createUser } = buildService({
      SEED_DOCENT_FIREBASE_UID: 'missing-uid',
    })
    getUser.mockRejectedValue({ code: 'auth/user-not-found' })

    await expect(
      service.ensureFirebaseUser(account, 'demo-password'),
    ).rejects.toThrow(/override/)
    expect(createUser).not.toHaveBeenCalled()
  })
})
