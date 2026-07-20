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
  /** Shared demo password for seeded Firebase accounts (evaluation only). */
  SEED_DEMO_PASSWORD: Joi.string().min(1).optional(),
  SEED_DOCENT_FIREBASE_UID: Joi.string().min(1).optional(),
  SEED_APOTHEKER1_FIREBASE_UID: Joi.string().min(1).optional(),
  SEED_APOTHEKER2_FIREBASE_UID: Joi.string().min(1).optional(),
  SEED_APOTHEKER3_FIREBASE_UID: Joi.string().min(1).optional(),
  SEED_BEZORGER1_FIREBASE_UID: Joi.string().min(1).optional(),
  SEED_BEZORGER2_FIREBASE_UID: Joi.string().min(1).optional(),
})

export type EnvConfig = {
  NODE_ENV: 'development' | 'test' | 'production'
  PORT: number
  URL_FRONTEND: string
  DB_HOST: string
  DB_NAME: string
  GOOGLE_APPLICATION_CREDENTIALS?: string
  ALLOW_DATABASE_SEED: boolean
  SEED_DEMO_PASSWORD?: string
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
