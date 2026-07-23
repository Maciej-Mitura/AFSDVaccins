import Joi from 'joi'

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  URL_FRONTEND: Joi.string().uri().required(),
  DB_HOST: Joi.string()
    .pattern(/^mongodb(\+srv)?:\/\//)
    .required()
    .messages({
      'string.pattern.base':
        'DB_HOST must be a MongoDB connection URL (mongodb:// or mongodb+srv://)',
    }),
  DB_NAME: Joi.string().min(1).required(),
  GOOGLE_APPLICATION_CREDENTIALS: Joi.string().min(1).optional(),
  /** Explicit opt-in for the development seed CLI (never default-on). */
  ALLOW_DATABASE_SEED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),
  /**
   * Playwright / browser E2E only: accept deterministic Bearer tokens.
   * Requires NODE_ENV=test as well (enforced in FirebaseService).
   */
  ALLOW_E2E_AUTH_BYPASS: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),
  /** Shared demo password for pharmacist/courier (and personal-admin create) accounts. */
  SEED_DEMO_PASSWORD: Joi.string().min(1).allow('').optional(),
  /** Teacher/evaluator ADMIN password (docent@howest.be). */
  SEED_TEACHER_ADMIN_PASSWORD: Joi.string().min(1).allow('').optional(),
  /** Personal evaluation-owner ADMIN email (never hardcoded in TypeScript). */
  SEED_PERSONAL_ADMIN_EMAIL: Joi.string().email().allow('').optional(),
  SEED_PERSONAL_ADMIN_FIREBASE_UID: Joi.string().min(1).allow('').optional(),
  SEED_DOCENT_FIREBASE_UID: Joi.string().min(1).allow('').optional(),
  SEED_APOTHEKER1_FIREBASE_UID: Joi.string().min(1).allow('').optional(),
  SEED_APOTHEKER2_FIREBASE_UID: Joi.string().min(1).allow('').optional(),
  SEED_APOTHEKER3_FIREBASE_UID: Joi.string().min(1).allow('').optional(),
  SEED_BEZORGER1_FIREBASE_UID: Joi.string().min(1).allow('').optional(),
  SEED_BEZORGER2_FIREBASE_UID: Joi.string().min(1).allow('').optional(),
})

export type EnvConfig = {
  NODE_ENV: 'development' | 'test' | 'production'
  PORT: number
  URL_FRONTEND: string
  DB_HOST: string
  DB_NAME: string
  GOOGLE_APPLICATION_CREDENTIALS?: string
  ALLOW_DATABASE_SEED: boolean
  ALLOW_E2E_AUTH_BYPASS: boolean
  SEED_DEMO_PASSWORD?: string
  SEED_TEACHER_ADMIN_PASSWORD?: string
  SEED_PERSONAL_ADMIN_EMAIL?: string
  SEED_PERSONAL_ADMIN_FIREBASE_UID?: string
  SEED_DOCENT_FIREBASE_UID?: string
  SEED_APOTHEKER1_FIREBASE_UID?: string
  SEED_APOTHEKER2_FIREBASE_UID?: string
  SEED_APOTHEKER3_FIREBASE_UID?: string
  SEED_BEZORGER1_FIREBASE_UID?: string
  SEED_BEZORGER2_FIREBASE_UID?: string
}

export const buildMongoUrl = (dbHost: string, dbName: string): string => {
  const normalizedHost = dbHost.endsWith('/') ? dbHost.slice(0, -1) : dbHost
  return `${normalizedHost}/${dbName}`
}

/** Extract hostname only — never return credentials or full connection URLs. */
export function safeMongoHostname(dbHost: string): string {
  try {
    const parsed = new URL(dbHost)
    return parsed.hostname.length > 0 ? parsed.hostname : 'unknown'
  } catch {
    return 'unparsed'
  }
}
