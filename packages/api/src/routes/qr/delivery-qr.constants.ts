/** Current delivery QR token format version. */
export const DELIVERY_QR_TOKEN_VERSION = 1 as const

/** Minimum accepted signing-secret length (prefer ≥32 cryptographically random bytes). */
export const DELIVERY_QR_SIGNING_SECRET_MIN_LENGTH = 32

/** Raw nonce size in bytes before encoding. */
export const DELIVERY_QR_NONCE_BYTES = 32

/** Nest DI token for the QR token service. */
export const DELIVERY_QR_TOKEN_SERVICE = Symbol('DELIVERY_QR_TOKEN_SERVICE')

/** Nest DI token for injectable randomness (tests may replace). */
export const DELIVERY_QR_RANDOM_SOURCE = Symbol('DELIVERY_QR_RANDOM_SOURCE')

/**
 * Deterministic secret for unit/e2e tests only — must be injected explicitly via
 * env (NODE_ENV=test) or constructor. Never used as a production/development fallback.
 */
export const DELIVERY_QR_TEST_SIGNING_SECRET =
  'test-only-delivery-qr-signing-secret-32b!'
