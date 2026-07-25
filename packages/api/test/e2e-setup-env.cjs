const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')

/**
 * Ensures required E2E env vars exist before AppModule is imported.
 * Prefers the runtime file written by globalSetup (memory-server URI).
 */
process.env.NODE_ENV = 'test'
process.env.PORT = process.env.PORT ?? '3456'
process.env.URL_FRONTEND = process.env.URL_FRONTEND ?? 'http://localhost:5173'
process.env.ALLOW_DATABASE_SEED = 'false'

const runtimePath = join(__dirname, '.e2e-mongo-runtime.json')
if (existsSync(runtimePath)) {
  const runtime = JSON.parse(readFileSync(runtimePath, 'utf8'))
  if (runtime.dbHost) {
    process.env.DB_HOST = runtime.dbHost
  }
  if (runtime.dbName) {
    process.env.DB_NAME = runtime.dbName
  }
}

process.env.DB_NAME = process.env.DB_NAME ?? 'vaccin_delivery_e2e_test'

// Phase 26A — deterministic test signing secret (explicit injection; never production).
process.env.DELIVERY_QR_SIGNING_SECRET =
  process.env.DELIVERY_QR_SIGNING_SECRET ??
  'test-only-delivery-qr-signing-secret-32b!'

if (!process.env.DB_HOST) {
  throw new Error(
    'E2E DB_HOST missing — jest globalSetup did not write .e2e-mongo-runtime.json',
  )
}
