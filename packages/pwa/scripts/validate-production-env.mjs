/**
 * CLI entry for production PWA env validation.
 * Usage: node --experimental-strip-types ./scripts/validate-production-env.mjs
 *
 * Loads env via Vite's loadEnv('production', pwaRoot, '') so
 * .env.production.local is visible before `vite build` (same files Vite uses).
 * PWA root is resolved from this script's location (not the process working directory).
 *
 * Kept as .mjs so lint-staged does not run typescript-eslint projectService on it.
 */
import process from 'node:process'

import {
  loadProductionPwaEnv,
  resolvePwaRootFromScriptUrl,
} from '../src/config/load-production-pwa-env.ts'
import { collectProductionEnvErrors } from '../src/config/production-env-validation.ts'

const pwaRoot = resolvePwaRootFromScriptUrl(import.meta.url)
const env = loadProductionPwaEnv(pwaRoot)
const errors = collectProductionEnvErrors(env)

if (errors.length > 0) {
  console.error('PWA production environment validation failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log('PWA production environment validation passed')
