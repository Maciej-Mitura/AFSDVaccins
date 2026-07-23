import { UserRole } from '../user/user-role.enum'

export type SeedAccountKey =
  | 'personalAdmin'
  | 'docent'
  | 'apotheker1'
  | 'apotheker2'
  | 'apotheker3'
  | 'bezorger1'
  | 'bezorger2'

export type SeedPasswordSource = 'demo' | 'teacher'

export type SeedAccountDefinition = {
  key: SeedAccountKey
  /** Static email when not loaded from environment. */
  email?: string
  /** When set, email is required from this env var (never hardcoded). */
  emailEnvKey?: 'SEED_PERSONAL_ADMIN_EMAIL'
  role: UserRole
  firstName: string
  lastName: string
  /** Optional env var name for Firebase UID override. */
  firebaseUidEnvKey: string
  passwordSource: SeedPasswordSource
}

export type ResolvedSeedAccount = {
  key: SeedAccountKey
  email: string
  role: UserRole
  firstName: string
  lastName: string
  firebaseUidEnvKey: string
  password: string
}

/**
 * Architecture §14.1 demo accounts plus personal evaluation-owner ADMIN.
 * Passwords and the personal admin email come from environment — never hardcoded.
 */
export const SEED_ACCOUNTS: readonly SeedAccountDefinition[] = [
  {
    key: 'personalAdmin',
    emailEnvKey: 'SEED_PERSONAL_ADMIN_EMAIL',
    role: UserRole.ADMIN,
    firstName: 'Personal',
    lastName: 'Admin',
    firebaseUidEnvKey: 'SEED_PERSONAL_ADMIN_FIREBASE_UID',
    passwordSource: 'demo',
  },
  {
    key: 'docent',
    email: 'docent@howest.be',
    role: UserRole.ADMIN,
    firstName: 'Docent',
    lastName: 'Howest',
    firebaseUidEnvKey: 'SEED_DOCENT_FIREBASE_UID',
    passwordSource: 'teacher',
  },
  {
    key: 'apotheker1',
    email: 'apotheker1@demo.be',
    role: UserRole.APOTHEKER,
    firstName: 'Anna',
    lastName: 'Apotheker',
    firebaseUidEnvKey: 'SEED_APOTHEKER1_FIREBASE_UID',
    passwordSource: 'demo',
  },
  {
    key: 'apotheker2',
    email: 'apotheker2@demo.be',
    role: UserRole.APOTHEKER,
    firstName: 'Bram',
    lastName: 'Apotheker',
    firebaseUidEnvKey: 'SEED_APOTHEKER2_FIREBASE_UID',
    passwordSource: 'demo',
  },
  {
    key: 'apotheker3',
    email: 'apotheker3@demo.be',
    role: UserRole.APOTHEKER,
    firstName: 'Chris',
    lastName: 'Apotheker',
    firebaseUidEnvKey: 'SEED_APOTHEKER3_FIREBASE_UID',
    passwordSource: 'demo',
  },
  {
    key: 'bezorger1',
    email: 'bezorger1@demo.be',
    role: UserRole.BEZORGER,
    firstName: 'Daan',
    lastName: 'Bezorger',
    firebaseUidEnvKey: 'SEED_BEZORGER1_FIREBASE_UID',
    passwordSource: 'demo',
  },
  {
    key: 'bezorger2',
    email: 'bezorger2@demo.be',
    role: UserRole.BEZORGER,
    firstName: 'Emma',
    lastName: 'Bezorger',
    firebaseUidEnvKey: 'SEED_BEZORGER2_FIREBASE_UID',
    passwordSource: 'demo',
  },
] as const

export function resolveSeedAccounts(input: {
  personalAdminEmail: string
  demoPassword: string
  teacherPassword: string
}): ResolvedSeedAccount[] {
  return SEED_ACCOUNTS.map(account => {
    const email = account.emailEnvKey
      ? input.personalAdminEmail.trim().toLowerCase()
      : (account.email ?? '').trim().toLowerCase()

    if (!email) {
      throw new Error(
        `Seed account "${account.key}" is missing a resolved email address.`,
      )
    }

    const password =
      account.passwordSource === 'teacher'
        ? input.teacherPassword
        : input.demoPassword

    return {
      key: account.key,
      email,
      role: account.role,
      firstName: account.firstName,
      lastName: account.lastName,
      firebaseUidEnvKey: account.firebaseUidEnvKey,
      password,
    }
  })
}

export type SeedApothekerProfileDefinition = {
  accountKey: 'apotheker1' | 'apotheker2' | 'apotheker3'
  pharmacyName: string
  address: {
    street: string
    houseNumber: string
    postalCode: string
    city: string
    country: string
  }
}

export const SEED_APOTHEKER_PROFILES: readonly SeedApothekerProfileDefinition[] =
  [
    {
      accountKey: 'apotheker1',
      pharmacyName: 'Apotheek Centrum Brugge',
      address: {
        street: 'Steenstraat',
        houseNumber: '12',
        postalCode: '8000',
        city: 'Brugge',
        country: 'BE',
      },
    },
    {
      accountKey: 'apotheker2',
      pharmacyName: 'Apotheek Station Gent',
      address: {
        street: 'Koningin Astridlaan',
        houseNumber: '45',
        postalCode: '9000',
        city: 'Gent',
        country: 'BE',
      },
    },
    {
      accountKey: 'apotheker3',
      pharmacyName: 'Apotheek Park Antwerpen',
      address: {
        street: 'Meir',
        houseNumber: '88',
        postalCode: '2000',
        city: 'Antwerpen',
        country: 'BE',
      },
    },
  ] as const

export type SeedBezorgerProfileDefinition = {
  accountKey: 'bezorger1' | 'bezorger2'
  displayName: string
  vehicleLabel: string
}

export const SEED_BEZORGER_PROFILES: readonly SeedBezorgerProfileDefinition[] = [
  {
    accountKey: 'bezorger1',
    displayName: 'Daan Route West',
    vehicleLabel: 'Van-W01',
  },
  {
    accountKey: 'bezorger2',
    displayName: 'Emma Route Oost',
    vehicleLabel: 'Van-O02',
  },
] as const
