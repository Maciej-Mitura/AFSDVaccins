import { config as loadDotenv } from 'dotenv'
import { existsSync } from 'node:fs'
import path from 'node:path'

import {
  DEFAULT_DIST_LOCALES_DIR,
  DEFAULT_PWA_LOCALES_DIR,
  PACKAGE_ROOT,
  resolveFromPackageRoot,
} from './paths.js'

export const SUPPORTED_LOCALES = ['nl', 'en', 'zh', 'es'] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export interface ExporterConfig {
  spreadsheetId: string
  credentialsPath: string
  tokenPath: string
  distLocalesDir: string
  pwaLocalesDir: string
  packageRoot: string
}

function requireNonEmpty(name: string, value: string | undefined): string {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) {
    throw new Error(
      `Missing required configuration: ${name}. Set it in packages/i18n-export/.env (see .env.example).`,
    )
  }
  return trimmed
}

/**
 * Load exporter configuration from `packages/i18n-export/.env` (and process.env).
 * Path overrides are absolute or package-root-relative — never cwd-relative alone.
 */
export function loadExporterConfig(
  env: NodeJS.ProcessEnv = process.env,
): ExporterConfig {
  const envFile = path.join(PACKAGE_ROOT, '.env')
  if (existsSync(envFile)) {
    loadDotenv({ path: envFile, override: false })
  }

  const spreadsheetId = requireNonEmpty(
    'GOOGLE_SHEETS_SPREADSHEET_ID',
    env.GOOGLE_SHEETS_SPREADSHEET_ID,
  )

  const credentialsPath = resolveFromPackageRoot(
    env.GOOGLE_SHEETS_CREDENTIALS_PATH?.trim() || './credentials.json',
  )
  const tokenPath = resolveFromPackageRoot(
    env.GOOGLE_SHEETS_TOKEN_PATH?.trim() || './token.json',
  )

  const distLocalesDir = env.GOOGLE_SHEETS_DIST_LOCALES_DIR?.trim()
    ? resolveFromPackageRoot(env.GOOGLE_SHEETS_DIST_LOCALES_DIR.trim())
    : DEFAULT_DIST_LOCALES_DIR

  const pwaLocalesDir = env.GOOGLE_SHEETS_PWA_LOCALES_DIR?.trim()
    ? resolveFromPackageRoot(env.GOOGLE_SHEETS_PWA_LOCALES_DIR.trim())
    : DEFAULT_PWA_LOCALES_DIR

  return {
    spreadsheetId,
    credentialsPath,
    tokenPath,
    distLocalesDir,
    pwaLocalesDir,
    packageRoot: PACKAGE_ROOT,
  }
}

export function assertCredentialsPresent(credentialsPath: string): void {
  if (!existsSync(credentialsPath)) {
    throw new Error(
      `Google OAuth credentials file not found at ${credentialsPath}. ` +
        `Download a Desktop OAuth client JSON from Google Cloud Console and save it as credentials.json ` +
        `(see README — i18n exporter). Do not commit this file.`,
    )
  }
}
