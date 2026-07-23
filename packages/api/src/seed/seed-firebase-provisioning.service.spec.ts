import { ConfigService } from '@nestjs/config'

import { FirebaseService } from '../authentication/firebase.service'
import { EnvConfig } from '../config/env.validation'
import { UserRole } from '../user/user-role.enum'
import { ResolvedSeedAccount } from './seed.accounts'
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

  const teacherAccount: ResolvedSeedAccount = {
    key: 'docent',
    email: 'docent@howest.be',
    role: UserRole.ADMIN,
    firstName: 'Docent',
    lastName: 'Howest',
    firebaseUidEnvKey: 'SEED_DOCENT_FIREBASE_UID',
    password: 'teacher-password',
  }

  const personalAccount: ResolvedSeedAccount = {
    key: 'personalAdmin',
    email: 'owner@example.com',
    role: UserRole.ADMIN,
    firstName: 'Personal',
    lastName: 'Admin',
    firebaseUidEnvKey: 'SEED_PERSONAL_ADMIN_FIREBASE_UID',
    password: 'demo-password',
  }

  it('reuses Firebase user by email without creating', async () => {
    const { service, getUserByEmail, createUser } = buildService()
    getUserByEmail.mockResolvedValue({ uid: 'existing-uid-12345678' })

    const result = await service.ensureFirebaseUser(teacherAccount)

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

    const result = await service.ensureFirebaseUser(teacherAccount)

    expect(result.created).toBe(true)
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: teacherAccount.email,
        password: 'teacher-password',
        emailVerified: true,
      }),
    )
  })

  it('reuses personal ADMIN by UID when email matches', async () => {
    const { service, getUser, createUser, getUserByEmail } = buildService({
      SEED_PERSONAL_ADMIN_FIREBASE_UID: 'personal-uid-xyz',
    })
    getUser.mockResolvedValue({
      uid: 'personal-uid-xyz',
      email: 'owner@example.com',
    })

    const result = await service.ensureFirebaseUser(personalAccount)

    expect(result).toEqual({
      uid: 'personal-uid-xyz',
      created: false,
      reused: true,
    })
    expect(createUser).not.toHaveBeenCalled()
    expect(getUserByEmail).not.toHaveBeenCalled()
  })

  it('rejects UID override when Firebase email does not match seed email', async () => {
    const { service, getUser, createUser } = buildService({
      SEED_PERSONAL_ADMIN_FIREBASE_UID: 'personal-uid-xyz',
    })
    getUser.mockResolvedValue({
      uid: 'personal-uid-xyz',
      email: 'other@example.com',
    })

    await expect(service.ensureFirebaseUser(personalAccount)).rejects.toThrow(
      /email mismatch/,
    )
    expect(createUser).not.toHaveBeenCalled()
  })

  it('reuses override UID without createUser when email matches', async () => {
    const { service, getUser, createUser, getUserByEmail } = buildService({
      SEED_DOCENT_FIREBASE_UID: 'override-uid-xyz',
    })
    getUser.mockResolvedValue({
      uid: 'override-uid-xyz',
      email: 'docent@howest.be',
    })

    const result = await service.ensureFirebaseUser(teacherAccount)

    expect(result.reused).toBe(true)
    expect(createUser).not.toHaveBeenCalled()
    expect(getUserByEmail).not.toHaveBeenCalled()
  })

  it('refuses missing override UID instead of creating another account', async () => {
    const { service, getUser, createUser } = buildService({
      SEED_DOCENT_FIREBASE_UID: 'missing-uid',
    })
    getUser.mockRejectedValue({ code: 'auth/user-not-found' })

    await expect(service.ensureFirebaseUser(teacherAccount)).rejects.toThrow(
      /override/,
    )
    expect(createUser).not.toHaveBeenCalled()
  })
})
