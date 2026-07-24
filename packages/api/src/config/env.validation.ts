import Joi from 'joi'

import {
  API_JSON_BODY_LIMIT_MAX_BYTES,
  assertBodyLimitWithinPolicy,
  isValidBodyLimitSyntax,
} from './body-limit'
import { parseTrustProxy } from './trust-proxy'

export const DATABASE_BOOTSTRAP_CONFIRMATION_PHRASE =
  'BOOTSTRAP_PUBLIC_DEMO_DATABASE'

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
  /**
   * Railway / PaaS Firebase Admin credential (raw JSON or base64 JSON).
   * Validated at Firebase init time — never log this value.
   */
  FIREBASE_SERVICE_ACCOUNT_JSON: Joi.string().min(1).optional(),
  /**
   * Express trust proxy. Only unset/false/0 (off) or 1 (one hop) are allowed.
   * Railway single-service recommendation: TRUST_PROXY=1.
   */
  TRUST_PROXY: Joi.any()
    .default(false)
    .custom((value: unknown, helpers) => {
      try {
        return parseTrustProxy(value)
      } catch {
        return helpers.error('any.invalid')
      }
    })
    .messages({
      'any.invalid':
        'TRUST_PROXY must be unset/false/0 (disabled) or 1 (trust one proxy hop)',
    }),
  /** Explicit opt-in for the development seed CLI (never default-on). */
  ALLOW_DATABASE_SEED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),
  /**
   * Explicit opt-in for the one-off production/demo bootstrap CLI.
   * Never used by API startup or Docker CMD.
   */
  ALLOW_DATABASE_BOOTSTRAP: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),
  /**
   * Must equal DATABASE_BOOTSTRAP_CONFIRMATION_PHRASE when bootstrapping.
   * Enforced by BootstrapSafetyService (not Joi alone).
   */
  CONFIRM_DATABASE_BOOTSTRAP: Joi.string().allow('').optional(),
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

  // ---- Phase 22 security / performance (TTL values are milliseconds) ----
  THROTTLE_DEFAULT_TTL_MS: Joi.number().integer().min(1000).default(60_000),
  THROTTLE_DEFAULT_LIMIT: Joi.number().integer().min(1).default(120),
  THROTTLE_STRICT_TTL_MS: Joi.number().integer().min(1000).default(60_000),
  THROTTLE_STRICT_LIMIT: Joi.number().integer().min(1).default(20),
  CACHE_DEFAULT_TTL_MS: Joi.number().integer().min(1000).default(30_000),
  CACHE_REFERENCE_TTL_MS: Joi.number().integer().min(1000).default(60_000),
  /**
   * GraphQL selection-set nesting limit.
   * Representative PWA documents peak around depth 4–5; minimum 2 for tests.
   */
  GRAPHQL_MAX_DEPTH: Joi.number().integer().min(2).default(12),
  /**
   * GraphQL query complexity (simpleEstimator defaultComplexity=1 per field).
   * Measured largest representative ops are well under 200; default leaves headroom.
   */
  GRAPHQL_MAX_COMPLEXITY: Joi.number().integer().min(10).default(500),
  /**
   * Authoritative Express JSON / urlencoded `limit` (e.g. 100kb, 1mb).
   * Units are case-insensitive; positive sizes only; max 32mb (media uploads: Phase 25).
   */
  API_JSON_BODY_LIMIT: Joi.string()
    .default('1mb')
    .custom((value: string, helpers) => {
      if (!isValidBodyLimitSyntax(value)) {
        return helpers.error('any.invalid')
      }
      try {
        assertBodyLimitWithinPolicy(value)
      } catch {
        return helpers.error('any.invalid')
      }
      return value.trim()
    })
    .messages({
      'any.invalid': `API_JSON_BODY_LIMIT must be a positive size like 100kb or 1mb (max ${API_JSON_BODY_LIMIT_MAX_BYTES} bytes)`,
    }),
})

export type EnvConfig = {
  NODE_ENV: 'development' | 'test' | 'production'
  PORT: number
  URL_FRONTEND: string
  DB_HOST: string
  DB_NAME: string
  GOOGLE_APPLICATION_CREDENTIALS?: string
  FIREBASE_SERVICE_ACCOUNT_JSON?: string
  TRUST_PROXY: false | 1
  ALLOW_DATABASE_SEED: boolean
  ALLOW_DATABASE_BOOTSTRAP: boolean
  CONFIRM_DATABASE_BOOTSTRAP?: string
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
  THROTTLE_DEFAULT_TTL_MS: number
  THROTTLE_DEFAULT_LIMIT: number
  THROTTLE_STRICT_TTL_MS: number
  THROTTLE_STRICT_LIMIT: number
  CACHE_DEFAULT_TTL_MS: number
  CACHE_REFERENCE_TTL_MS: number
  GRAPHQL_MAX_DEPTH: number
  GRAPHQL_MAX_COMPLEXITY: number
  API_JSON_BODY_LIMIT: string
}

/**
 * Insert DB_NAME into the Mongo URI path while preserving query params.
 * Atlas SRV URIs commonly look like:
 *   mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority
 * Naive `${host}/${dbName}` would append after `?` and leave no database path
 * (Mongo driver then defaults to `test`).
 */
export const buildMongoUrl = (dbHost: string, dbName: string): string => {
  const parsed = new URL(dbHost)
  parsed.pathname = `/${dbName}`
  return parsed.toString()
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
