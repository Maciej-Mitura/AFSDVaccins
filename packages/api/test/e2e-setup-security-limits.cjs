/**
 * Must run from Jest setupFiles BEFORE any AppModule import.
 * ConfigModule.forRoot validates process.env synchronously at import time.
 */
process.env.PHASE22_SECURITY_LIMITS = 'true'
process.env.THROTTLE_DEFAULT_LIMIT = '5'
process.env.THROTTLE_DEFAULT_TTL_MS = '60000'
process.env.THROTTLE_STRICT_LIMIT = '100'
process.env.THROTTLE_STRICT_TTL_MS = '60000'
process.env.GRAPHQL_MAX_DEPTH = '3'
process.env.GRAPHQL_MAX_COMPLEXITY = '40'
