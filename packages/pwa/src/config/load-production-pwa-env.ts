import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadEnv } from 'vite'

/**
 * Resolve the PWA package root from a script URL (typically import.meta.url
 * of packages/pwa/scripts/validate-production-env.mjs).
 * Does not use process.cwd() — safe from monorepo root, package dir, or CI.
 */
export function resolvePwaRootFromScriptUrl(scriptUrl: string | URL): string {
  return join(dirname(fileURLToPath(scriptUrl)), '..')
}

/**
 * Load production-mode env the same way Vite does for `vite build`.
 *
 * Uses mode `production` only (not development). With prefix `''`, Vite returns
 * all keys from `.env`, `.env.local`, `.env.production`, and
 * `.env.production.local`; callers still validate only required VITE_* keys.
 *
 * Precedence (Vite loadEnv): explicit process.env values override file values.
 * Does not mutate process.env with file contents.
 */
export function loadProductionPwaEnv(
  pwaRoot: string,
): Record<string, string | undefined> {
  return loadEnv('production', pwaRoot, '')
}
