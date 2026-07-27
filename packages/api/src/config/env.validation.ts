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

  /**
   * Vaccine image analysis backend: `fake` (local/tests) or `azure` (production target).
   * Fake is rejected when NODE_ENV=production.
   */
  VACCINE_IMAGE_ANALYSIS_PROVIDER: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().valid('azure').default('azure'),
    otherwise: Joi.string().valid('fake', 'azure').default('fake'),
  }),
  /**
   * Vaccine image binary storage backend: `fake` (local/tests) or `azure` (production target).
   * Fake is rejected when NODE_ENV=production.
   */
  VACCINE_IMAGE_STORAGE_PROVIDER: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().valid('azure').default('azure'),
    otherwise: Joi.string().valid('fake', 'azure').default('fake'),
  }),

  /**
   * Azure Blob connection string (AccountName + AccountKey required for SAS).
   * Required when VACCINE_IMAGE_STORAGE_PROVIDER=azure (including production default).
   * Never log this value.
   */
  AZURE_STORAGE_CONNECTION_STRING: Joi.when('VACCINE_IMAGE_STORAGE_PROVIDER', {
    is: 'azure',
    then: Joi.string().min(1).required(),
    otherwise: Joi.when('NODE_ENV', {
      is: 'production',
      then: Joi.string().min(1).required(),
      otherwise: Joi.string().allow('').optional(),
    }),
  }),
  /**
   * Private blob container for vaccine images (e.g. vaccine-images).
   * Required when storage provider is azure.
   */
  AZURE_STORAGE_CONTAINER_NAME: Joi.when('VACCINE_IMAGE_STORAGE_PROVIDER', {
    is: 'azure',
    then: Joi.string().min(1).required(),
    otherwise: Joi.when('NODE_ENV', {
      is: 'production',
      then: Joi.string().min(1).required(),
      otherwise: Joi.string().allow('').optional(),
    }),
  }),
  /**
   * Short-lived read SAS TTL in seconds (bounded 60–3600; default 900).
   * Used by the Azure storage provider only; fake storage ignores this.
   */
  AZURE_STORAGE_READ_URL_TTL_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(3600)
    .default(900),
  /**
   * Private blob container for route voice-report audio (Phase 34A).
   * Non-secret; defaults to route-voice-reports. Reuses AZURE_STORAGE_CONNECTION_STRING.
   * Container must already exist with anonymous access disabled.
   */
  AZURE_STORAGE_ROUTE_VOICE_REPORTS_CONTAINER: Joi.string()
    .min(1)
    .max(63)
    .pattern(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/)
    .default('route-voice-reports'),

  /**
   * Azure AI Vision Image Analysis 4.0 endpoint (HTTPS only).
   * Required when VACCINE_IMAGE_ANALYSIS_PROVIDER=azure (including production default).
   * Never log this value with query credentials (endpoint should be host-only).
   */
  AZURE_VISION_ENDPOINT: Joi.when('VACCINE_IMAGE_ANALYSIS_PROVIDER', {
    is: 'azure',
    then: Joi.string()
      .uri({ scheme: ['https'] })
      .required(),
    otherwise: Joi.when('NODE_ENV', {
      is: 'production',
      then: Joi.string()
        .uri({ scheme: ['https'] })
        .required(),
      otherwise: Joi.string().allow('').optional(),
    }),
  }),
  /**
   * Azure AI Vision subscription key.
   * Required when analysis provider is azure. Never log this value.
   */
  AZURE_VISION_KEY: Joi.when('VACCINE_IMAGE_ANALYSIS_PROVIDER', {
    is: 'azure',
    then: Joi.string().min(1).required(),
    otherwise: Joi.when('NODE_ENV', {
      is: 'production',
      then: Joi.string().min(1).required(),
      otherwise: Joi.string().allow('').optional(),
    }),
  }),
  /**
   * Azure Vision HTTP timeout in milliseconds (bounded 1000–30000; default 10000).
   * Used by the Azure analysis provider only; fake analysis ignores this.
   */
  AZURE_VISION_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(30_000)
    .default(10_000),

  // ---- Phase 34B Azure Speech fast transcription (backend-only) ----
  /**
   * When false, uploads still succeed but transcription is not scheduled.
   * Default true; local/tests typically use the fake provider.
   */
  ROUTE_VOICE_TRANSCRIPTION_ENABLED: Joi.boolean().default(true),
  /**
   * Transcription backend: `fake` (local/tests) or `azure` (production target).
   * Fake is rejected when NODE_ENV=production.
   */
  ROUTE_VOICE_TRANSCRIPTION_PROVIDER: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().valid('azure').default('azure'),
    otherwise: Joi.string().valid('fake', 'azure').default('fake'),
  }),
  /**
   * Azure AI Speech resource endpoint (HTTPS only), e.g.
   * https://<resource>.cognitiveservices.azure.com
   * Required when ROUTE_VOICE_TRANSCRIPTION_PROVIDER=azure.
   */
  AZURE_SPEECH_ENDPOINT: Joi.when('ROUTE_VOICE_TRANSCRIPTION_PROVIDER', {
    is: 'azure',
    then: Joi.string()
      .uri({ scheme: ['https'] })
      .required(),
    otherwise: Joi.when('NODE_ENV', {
      is: 'production',
      then: Joi.string()
        .uri({ scheme: ['https'] })
        .required(),
      otherwise: Joi.string().allow('').optional(),
    }),
  }),
  /**
   * Azure AI Speech subscription key. Never log. Never expose to PWA.
   * Required when provider is azure / production.
   */
  AZURE_SPEECH_KEY: Joi.when('ROUTE_VOICE_TRANSCRIPTION_PROVIDER', {
    is: 'azure',
    then: Joi.string().min(1).required(),
    otherwise: Joi.when('NODE_ENV', {
      is: 'production',
      then: Joi.string().min(1).required(),
      otherwise: Joi.string().allow('').optional(),
    }),
  }),
  /** Fast-transcription HTTP timeout (ms); bounded 5000–180000; default 60000. */
  ROUTE_VOICE_TRANSCRIPTION_TIMEOUT_MS: Joi.number()
    .integer()
    .min(5_000)
    .max(180_000)
    .default(60_000),
  /** In-process concurrent transcription jobs per API instance (1–2). */
  ROUTE_VOICE_TRANSCRIPTION_CONCURRENCY: Joi.number()
    .integer()
    .min(1)
    .max(2)
    .default(1),
  /** Automatic transient attempts before FAILED (1–5; default 3). */
  ROUTE_VOICE_TRANSCRIPTION_MAX_ATTEMPTS: Joi.number()
    .integer()
    .min(1)
    .max(5)
    .default(3),
  /** Processing lease TTL in seconds (120–900; default 600). */
  ROUTE_VOICE_TRANSCRIPTION_LEASE_SECONDS: Joi.number()
    .integer()
    .min(120)
    .max(900)
    .default(600),
  /** Startup recovery batch size (1–100; default 25). */
  ROUTE_VOICE_TRANSCRIPTION_RECOVERY_BATCH_SIZE: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(25),

  // ---- Phase 26A delivery QR signing (backend-only; never log) ----
  /**
   * HMAC-SHA-256 signing secret for delivery-stop QR tokens.
   * Required in development and production (min 32 characters).
   * In NODE_ENV=test, omit to use the explicit test-only injected default in the
   * token module, or set a deterministic secret explicitly.
   * Never expose to GraphQL or the PWA. Never reuse Firebase/Azure credentials.
   */
  DELIVERY_QR_SIGNING_SECRET: Joi.when('NODE_ENV', {
    is: 'test',
    then: Joi.string().min(32).allow('').optional(),
    otherwise: Joi.string().min(32).required(),
  }),

  // ---- Phase 27A Web Push (backend-only secrets; public key may be exposed to PWA) ----
  /**
   * Push provider: `fake` (local/tests) or `webpush` (VAPID).
   * Fake is rejected when NODE_ENV=production.
   * No external push calls occur at module construction / startup.
   */
  PUSH_PROVIDER: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().valid('webpush').default('webpush'),
    otherwise: Joi.string().valid('fake', 'webpush').default('fake'),
  }),
  /**
   * VAPID public key (safe to expose to the PWA for PushManager.subscribe).
   * Required when PUSH_PROVIDER=webpush.
   */
  WEB_PUSH_VAPID_PUBLIC_KEY: Joi.when('PUSH_PROVIDER', {
    is: 'webpush',
    then: Joi.string().min(80).required(),
    otherwise: Joi.when('NODE_ENV', {
      is: 'production',
      then: Joi.string().min(80).required(),
      otherwise: Joi.string().allow('').optional(),
    }),
  }),
  /**
   * VAPID private key (backend-only). Never log. Never expose to GraphQL/PWA.
   * Required when PUSH_PROVIDER=webpush. Never reuse Firebase/Azure/QR secrets.
   */
  WEB_PUSH_VAPID_PRIVATE_KEY: Joi.when('PUSH_PROVIDER', {
    is: 'webpush',
    then: Joi.string().min(40).required(),
    otherwise: Joi.when('NODE_ENV', {
      is: 'production',
      then: Joi.string().min(40).required(),
      otherwise: Joi.string().allow('').optional(),
    }),
  }),
  /**
   * VAPID subject (mailto: or https:// contact URI).
   * Required when PUSH_PROVIDER=webpush.
   */
  WEB_PUSH_SUBJECT: Joi.when('PUSH_PROVIDER', {
    is: 'webpush',
    then: Joi.string()
      .pattern(/^(mailto:|https:\/\/)/i)
      .required(),
    otherwise: Joi.when('NODE_ENV', {
      is: 'production',
      then: Joi.string()
        .pattern(/^(mailto:|https:\/\/)/i)
        .required(),
      otherwise: Joi.string().allow('').optional(),
    }),
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
  VACCINE_IMAGE_ANALYSIS_PROVIDER: 'fake' | 'azure'
  VACCINE_IMAGE_STORAGE_PROVIDER: 'fake' | 'azure'
  AZURE_STORAGE_CONNECTION_STRING?: string
  AZURE_STORAGE_CONTAINER_NAME?: string
  AZURE_STORAGE_READ_URL_TTL_SECONDS: number
  AZURE_STORAGE_ROUTE_VOICE_REPORTS_CONTAINER: string
  AZURE_VISION_ENDPOINT?: string
  AZURE_VISION_KEY?: string
  AZURE_VISION_TIMEOUT_MS: number
  ROUTE_VOICE_TRANSCRIPTION_ENABLED: boolean
  ROUTE_VOICE_TRANSCRIPTION_PROVIDER: 'fake' | 'azure'
  AZURE_SPEECH_ENDPOINT?: string
  AZURE_SPEECH_KEY?: string
  ROUTE_VOICE_TRANSCRIPTION_TIMEOUT_MS: number
  ROUTE_VOICE_TRANSCRIPTION_CONCURRENCY: number
  ROUTE_VOICE_TRANSCRIPTION_MAX_ATTEMPTS: number
  ROUTE_VOICE_TRANSCRIPTION_LEASE_SECONDS: number
  ROUTE_VOICE_TRANSCRIPTION_RECOVERY_BATCH_SIZE: number
  DELIVERY_QR_SIGNING_SECRET?: string
  PUSH_PROVIDER: 'fake' | 'webpush'
  WEB_PUSH_VAPID_PUBLIC_KEY?: string
  WEB_PUSH_VAPID_PRIVATE_KEY?: string
  WEB_PUSH_SUBJECT?: string
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
