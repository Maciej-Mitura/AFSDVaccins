/**
 * Repair duplicate active RouteTemplate assignments.
 * Usage:
 *   npm run repair:route-template-assignments -- --courier <profileId> --keep <templateId>
 *   npm run repair:route-template-assignments -- --courier <profileId> --keep <templateId> --apply
 *
 * Dry-run by default. Never deletes templates. Never prints secrets.
 */
import { resolve } from 'node:path'

import { MongoClient } from 'mongodb'

import {
  applyRepairPlan,
  buildRepairPlan,
  diagnoseRouteTemplateAssignments,
  formatRepairPlan,
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

function parseArgs(argv: string[]): {
  courier: string | null
  keep: string | null
  apply: boolean
} {
  let courier: string | null = null
  let keep: string | null = null
  let apply = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--apply') {
      apply = true
      continue
    }
    if (arg === '--courier') {
      courier = argv[i + 1] ?? null
      i += 1
      continue
    }
    if (arg === '--keep') {
      keep = argv[i + 1] ?? null
      i += 1
      continue
    }
  }

  return { courier, keep, apply }
}

async function main(): Promise<void> {
  const apiRoot = resolve(__dirname, '..')
  const loaded = loadApiEnvFile(apiRoot)
  if (!loaded.loaded) {
    console.error(`No .env found at ${loaded.path} (continuing with process.env)`)
  }

  const { courier, keep, apply } = parseArgs(process.argv.slice(2))
  if (!courier || !keep) {
    console.error(
      'Usage: npm run repair:route-template-assignments -- --courier <profileId> --keep <templateId> [--apply]',
    )
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

  const client = new MongoClient(dbHost)
  try {
    await client.connect()
    const db = client.db(dbName)
    const diagnosis = await diagnoseRouteTemplateAssignments(db)
    const plan = buildRepairPlan({
      diagnosis,
      bezorgerProfileId: courier,
      keepTemplateId: keep,
      dryRun: !apply,
    })

    console.log(formatRepairPlan(plan).join('\n'))

    if (!apply) {
      console.log('No changes applied (dry-run). Re-run with --apply to mutate.')
      return
    }

    const result = await applyRepairPlan(db, plan)
    console.log(`Deactivated ${result.deactivatedCount} template(s). None deleted.`)
    console.log(`updatedByUserId set to cli:repair:route-template-assignments`)
  } finally {
    await client.close()
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Repair command failed'
  console.error(message)
  process.exitCode = 1
})
