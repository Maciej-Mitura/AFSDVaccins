const { writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { MongoMemoryServer } = require('mongodb-memory-server')

const E2E_DEFAULT_DB_NAME = 'vaccin_delivery_e2e_test'

/**
 * Starts one shared MongoMemoryServer for the GraphQL E2E run.
 * Writes connection details for setupFiles and keeps the server for teardown.
 */
module.exports = async function e2eGlobalSetup() {
  const mongoServer = await MongoMemoryServer.create()
  const dbHost = mongoServer.getUri().replace(/\/$/, '')
  const dbName = E2E_DEFAULT_DB_NAME

  process.env.NODE_ENV = 'test'
  process.env.PORT = process.env.PORT ?? '3456'
  process.env.URL_FRONTEND =
    process.env.URL_FRONTEND ?? 'http://localhost:5173'
  process.env.DB_HOST = dbHost
  process.env.DB_NAME = dbName
  process.env.ALLOW_DATABASE_SEED = 'false'
  process.env.DELIVERY_QR_SIGNING_SECRET =
    process.env.DELIVERY_QR_SIGNING_SECRET ??
    'test-only-delivery-qr-signing-secret-32b!'
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS
  delete process.env.GENERATE_SCHEMA_ONLY

  writeFileSync(
    join(__dirname, '.e2e-mongo-runtime.json'),
    JSON.stringify({ dbHost, dbName }),
  )

  globalThis.__E2E_MONGO_SERVER__ = mongoServer
}
