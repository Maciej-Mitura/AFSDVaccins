import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Stable package root for `@vaccin-delivery/i18n-export`.
 * Resolved from this module’s location so `npm run export:i18n` from the
 * monorepo root and `npm run export` inside the package behave the same.
 */
export const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)

/**
 * Resolve a path that is either absolute or relative to the package root.
 * Relative env values such as `./credentials.json` always mean
 * `packages/i18n-export/credentials.json`, never the caller’s cwd.
 */
export function resolveFromPackageRoot(relativeOrAbsolute: string): string {
  if (path.isAbsolute(relativeOrAbsolute)) {
    return path.normalize(relativeOrAbsolute)
  }
  return path.resolve(PACKAGE_ROOT, relativeOrAbsolute)
}

/** Monorepo root (parent of `packages/`). */
export const MONOREPO_ROOT = path.resolve(PACKAGE_ROOT, '..', '..')

export const DEFAULT_DIST_LOCALES_DIR = path.join(PACKAGE_ROOT, 'dist', 'locales')

export const DEFAULT_PWA_LOCALES_DIR = path.join(
  MONOREPO_ROOT,
  'packages',
  'pwa',
  'src',
  'locales',
)
