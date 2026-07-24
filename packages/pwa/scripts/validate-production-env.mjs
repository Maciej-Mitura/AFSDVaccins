/**
 * CLI entry for production PWA env validation.
 * Usage: node --experimental-strip-types ./scripts/validate-production-env.mjs
 *
 * Kept as .mjs so lint-staged does not run typescript-eslint projectService on it.
 */
import process from 'node:process'

import { collectProductionEnvErrors } from '../src/config/production-env-validation.ts'

const errors = collectProductionEnvErrors(process.env)
if (errors.length > 0) {
  console.error('PWA production environment validation failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}
console.log('PWA production environment validation passed')
