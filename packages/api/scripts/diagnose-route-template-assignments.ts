/**
 * Read-only diagnosis of duplicate active RouteTemplate assignments.
 * Usage: npm run diagnose:route-template-assignments
 *
 * Loads packages/api/.env (does not override existing process.env).
 * Never prints credentials or secrets. Does not mutate data.
 */
import { resolve } from 'node:path'

import { MongoClient } from 'mongodb'

import {
  diagnoseRouteTemplateAssignments,
  formatDiagnosisReport,
} from '../src/route-templates/route-template-assignment.diagnostics'

function loadApiEnvFile(apiRoot: string): { path: string; loaded: boolean } {
  const envPath = resolve(apiRoot, '.env')
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs')
    if (!fs.existsSync(envPath)) {
      return { path: envPath, loaded: false }
    }
    const text = fs.readFileSync(envPath, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }
      const eq = trimmed.indexOf('=')
      if (eq <= 0) {
        continue
      }
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) {
        process.env[key] = value
      }
    }
    return { path: envPath, loaded: true }
  } catch {
    return { path: envPath, loaded: false }
  }
}

function assertNoSecrets(text: string): void {
  const lowered = text.toLowerCase()
  const banned = [
    'password=',
    'secret=',
    'apikey=',
    'api_key=',
    'connectionstring',
    'private_key',
    'mongodb+srv://',
    'mongodb://',
  ]
  for (const token of banned) {
    if (lowered.includes(token)) {
      throw new Error('Diagnostic output unexpectedly contained a secret-like token')
    }
  }
}

async function main(): Promise<void> {
  const apiRoot = resolve(__dirname, '..')
  const loaded = loadApiEnvFile(apiRoot)
  if (!loaded.loaded) {
    console.error(`No .env found at ${loaded.path} (continuing with process.env)`)
  }

  const dbHost = process.env.DB_HOST?.trim()
  const dbName = process.env.DB_NAME?.trim()
  if (!dbHost || !dbName) {
    console.error('DB_HOST and DB_NAME are required')
    process.exitCode = 1
    return
  }

  const client = new MongoClient(dbHost)
  try {
    await client.connect()
    const diagnosis = await diagnoseRouteTemplateAssignments(client.db(dbName))
    const lines = formatDiagnosisReport(diagnosis)
    const text = lines.join('\n')
    assertNoSecrets(text)
    console.log(text)
    if (diagnosis.duplicateCourierCount > 0) {
      process.exitCode = 2
    }
  } finally {
    await client.close()
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Diagnostic command failed'
  console.error(message)
  process.exitCode = 1
})
