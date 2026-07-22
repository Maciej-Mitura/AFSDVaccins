const { unlinkSync } = require('node:fs')
const { join } = require('node:path')

module.exports = async function e2eGlobalTeardown() {
  const mongoServer = globalThis.__E2E_MONGO_SERVER__

  if (mongoServer) {
    await mongoServer.stop()
  }

  try {
    unlinkSync(join(__dirname, '.e2e-mongo-runtime.json'))
  } catch {
    // ignore
  }
}
