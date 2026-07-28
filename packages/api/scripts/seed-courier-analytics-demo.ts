/**
 * Phase 35C — controlled courier analytics demo data.
 *
 * Database-only synthetic couriers (Courier Stat 01–10). No Firebase Auth users.
 * Does not mutate presentation accounts (bezorger1/2, apotheker*, docent, …).
 *
 * Usage (from packages/api):
 *   npx ts-node --transpile-only scripts/seed-courier-analytics-demo.ts
 *   npx ts-node --transpile-only scripts/seed-courier-analytics-demo.ts --dry-run
 *   npx ts-node --transpile-only scripts/seed-courier-analytics-demo.ts --apply
 *   npx ts-node --transpile-only scripts/seed-courier-analytics-demo.ts --cleanup
 *
 * npm (note the extra `--` for flag forwarding):
 *   npm run seed:courier-analytics-demo -- --dry-run
 *   npm run seed:courier-analytics-demo -- --apply
 *   npm run seed:courier-analytics-demo -- --cleanup
 *
 * Default is dry-run (no mutation). Never prints credentials or DB URIs.
 */
import { resolve } from 'node:path'

import { MongoClient } from 'mongodb'

import {
  applyAnalyticsDemoPlan,
  cleanupAnalyticsDemoData,
} from '../src/analytics/courier/demo/courier-analytics-demo.apply'
import {
  buildAnalyticsDemoPlan,
  formatAnalyticsDemoPlanSummary,
} from '../src/analytics/courier/demo/courier-analytics-demo.plan'
import {
  assertAnalyticsDemoMutationAllowed,
  isProductionLikeAnalyticsDemoTarget,
} from '../src/analytics/courier/demo/courier-analytics-demo.safety'

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

function parseArgs(argv: string[]): {
  apply: boolean
  cleanup: boolean
  dryRun: boolean
} {
  let apply = false
  let cleanup = false
  let dryRunFlag = false

  for (const arg of argv) {
    if (arg === '--apply') {
      apply = true
      continue
    }
    if (arg === '--cleanup') {
      cleanup = true
      continue
    }
    if (arg === '--dry-run') {
      dryRunFlag = true
      continue
    }
  }

  if (apply && cleanup) {
    throw new Error('Use only one of --apply or --cleanup')
  }

  const dryRun = dryRunFlag || (!apply && !cleanup)
  return { apply, cleanup, dryRun }
}

function safeDbName(dbName: string): string {
  return dbName.trim() || '(empty)'
}

async function main(): Promise<void> {
  const apiRoot = resolve(__dirname, '..')
  const loaded = loadApiEnvFile(apiRoot)
  if (!loaded.loaded) {
    console.error(
      `No .env found at ${loaded.path} (continuing with process.env)`,
    )
  }

  let flags: { apply: boolean; cleanup: boolean; dryRun: boolean }
  try {
    flags = parseArgs(process.argv.slice(2))
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  const dbHost = process.env.DB_HOST?.trim()
  const dbName = process.env.DB_NAME?.trim()
  if (!dbHost || !dbName) {
    console.error('DB_HOST and DB_NAME are required')
    process.exitCode = 1
    return
  }

  const personalAdmin = process.env.SEED_PERSONAL_ADMIN_EMAIL?.trim()
  const extraProtected = personalAdmin ? [personalAdmin] : []

  const mode = flags.cleanup
    ? 'cleanup'
    : flags.apply && !flags.dryRun
      ? 'apply'
      : 'dry-run'

  if (!flags.dryRun) {
    try {
      assertAnalyticsDemoMutationAllowed({
        nodeEnv: process.env.NODE_ENV,
        dbName,
        confirmPhrase: process.env.CONFIRM_ANALYTICS_DEMO_DATA,
      })
    } catch (error: unknown) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
      return
    }
  } else if (
    isProductionLikeAnalyticsDemoTarget({
      nodeEnv: process.env.NODE_ENV,
      dbName,
    })
  ) {
    console.log(
      'Note: target looks production-like; mutation would require CONFIRM_ANALYTICS_DEMO_DATA.',
    )
  }

  const plan = buildAnalyticsDemoPlan({
    mode: mode === 'cleanup' ? 'cleanup' : mode === 'apply' ? 'apply' : 'dry-run',
    now: new Date(),
  })

  console.log(formatAnalyticsDemoPlanSummary(plan, safeDbName(dbName)))
  console.log(
    `- personas: ${plan.couriers.map(c => `${c.displayName}=${c.persona}`).join(', ')}`,
  )

  // Default / --dry-run without cleanup: diagnose plan only (no Mongo required).
  if (!flags.apply && !flags.cleanup) {
    console.log('Dry-run only — no database writes.')
    return
  }

  if (flags.apply && flags.dryRun) {
    console.log('Dry-run only — no database writes.')
    return
  }

  const client = new MongoClient(dbHost)
  try {
    await client.connect()
    const db = client.db(dbName)

    if (flags.cleanup) {
      const cleanupResult = await cleanupAnalyticsDemoData(db, {
        dryRun: flags.dryRun,
        extraProtectedEmails: extraProtected,
      })
      console.log(
        flags.dryRun ? 'Cleanup dry-run (no deletes):' : 'Cleanup applied:',
      )
      console.log(`- users deleted: ${cleanupResult.usersDeleted}`)
      console.log(`- profiles deleted: ${cleanupResult.profilesDeleted}`)
      console.log(`- templates deleted: ${cleanupResult.templatesDeleted}`)
      console.log(`- routes deleted: ${cleanupResult.routesDeleted}`)
      console.log(`- orders deleted: ${cleanupResult.ordersDeleted}`)
      return
    }

    const applyResult = await applyAnalyticsDemoPlan(db, plan, {
      dryRun: false,
      extraProtectedEmails: extraProtected,
    })
    console.log('Apply completed (upsert):')
    console.log(`- users: ${applyResult.usersUpserted}`)
    console.log(`- profiles: ${applyResult.profilesUpserted}`)
    console.log(`- templates: ${applyResult.templatesUpserted}`)
    console.log(`- routes: ${applyResult.routesUpserted}`)
    console.log(`- orders: ${applyResult.ordersUpserted}`)
  } finally {
    await client.close()
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
