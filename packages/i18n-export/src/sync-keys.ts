import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { authorizeGoogleSheets } from './authorize.js'
import {
  assertCredentialsPresent,
  loadExporterConfig,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from './config.js'
import { GoogleSheetsReader, readSupportedLocaleTabs } from './sheet-reader.js'
import { GoogleSheetsWriter } from './sheet-writer.js'
import {
  planKeySync,
  reportKeySyncPlan,
  type KeySyncSpec,
} from './sync-keys-logic.js'

export interface ParsedSyncKeysArgs {
  dryRun: boolean
  specs: KeySyncSpec[]
}

function printUsage(): void {
  console.info(`Usage:
  npm run sync:i18n:keys -- [--preview] <key>=<default> [<key>=<default>...] [--nl <text>] [--en <text>] [--zh <text>] [--es <text>]
  npm run sync:i18n:keys -- [--preview] --default <text> [--nl ...] <key> [<key>...]

Ensures translation-key rows exist on nl/en/zh/es tabs.
Appends missing keys only; never overwrites nonblank human translations.
OAuth write scope is requested only for this command (not for export:i18n).

Use --preview for dry-run (npm run swallows --dry-run as its own flag).
--dry-run still works when invoking the package script / tsx directly.
Prefer positional key=Default form (avoids npm eating --entry).`)
}

/**
 * Parse CLI arguments for explicit key-row synchronization.
 * Locale flags apply to every key in the invocation; omit them to leave column C blank.
 */
export function parseSyncKeysArgs(argv: string[]): ParsedSyncKeysArgs {
  // Prefer --preview: `npm run` treats --dry-run as its own no-op flag and drops it.
  const dryRun = argv.includes('--dry-run') || argv.includes('--preview')
  const args = argv.filter(arg => arg !== '--dry-run' && arg !== '--preview')

  const localeValues: Partial<Record<SupportedLocale, string>> = {}
  const entries: Array<{ key: string; defaultValue: string }> = []
  let sharedDefault: string | undefined

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (!arg) {
      continue
    }

    const takeValue = (flag: string): string => {
      const value = args[i + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`Missing value after ${flag}.`)
      }
      i += 1
      return value
    }

    if (arg === '--default') {
      sharedDefault = takeValue('--default')
      continue
    }
    if (arg === '--nl') {
      localeValues.nl = takeValue('--nl')
      continue
    }
    if (arg === '--en') {
      localeValues.en = takeValue('--en')
      continue
    }
    if (arg === '--zh') {
      localeValues.zh = takeValue('--zh')
      continue
    }
    if (arg === '--es') {
      localeValues.es = takeValue('--es')
      continue
    }
    if (arg === '--entry') {
      const raw = takeValue('--entry')
      const eq = raw.indexOf('=')
      if (eq <= 0) {
        throw new Error(
          `Invalid --entry "${raw}". Expected key=Default (Default may contain '=').`,
        )
      }
      entries.push({
        key: raw.slice(0, eq).trim(),
        defaultValue: raw.slice(eq + 1),
      })
      continue
    }
    if (arg === '--help' || arg === '-h') {
      printUsage()
      return { dryRun: true, specs: [] }
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg}`)
    }

    // Positional: key=Default (survives nested npm better than --entry)
    // or bare key (requires --default).
    const eq = arg.indexOf('=')
    if (eq > 0) {
      entries.push({
        key: arg.slice(0, eq).trim(),
        defaultValue: arg.slice(eq + 1),
      })
      continue
    }

    entries.push({ key: arg, defaultValue: '' })
  }

  if (entries.length === 0) {
    printUsage()
    throw new Error(
      'No keys provided. Pass <key>… with --default, or --entry key=Default.',
    )
  }

  const hasLocaleOverrides = Object.keys(localeValues).length > 0
  const specs: KeySyncSpec[] = entries.map(entry => {
    const defaultValue =
      entry.defaultValue.trim() !== ''
        ? entry.defaultValue
        : (sharedDefault ?? '')
    if (!defaultValue.trim()) {
      throw new Error(
        `Key "${entry.key}" is missing a Default. Use --default or --entry key=Default.`,
      )
    }
    return {
      key: entry.key,
      defaultValue,
      localeValues: hasLocaleOverrides ? { ...localeValues } : undefined,
    }
  })

  return { dryRun, specs }
}

export async function runSyncKeys(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  const { dryRun, specs } = parseSyncKeysArgs(argv)
  if (specs.length === 0) {
    return
  }

  const config = loadExporterConfig()
  assertCredentialsPresent(config.credentialsPath)

  console.info(
    dryRun
      ? 'Authenticating with Google Sheets (readonly dry-run)…'
      : 'Authenticating with Google Sheets (read/write key sync)…',
  )

  const auth = await authorizeGoogleSheets({
    credentialsPath: config.credentialsPath,
    tokenPath: config.tokenPath,
    mode: dryRun ? 'readonly' : 'readwrite',
  })

  const reader = new GoogleSheetsReader(auth)
  const sheets = await readSupportedLocaleTabs(
    reader,
    config.spreadsheetId,
    SUPPORTED_LOCALES,
  )

  const plan = planKeySync({
    locales: SUPPORTED_LOCALES,
    sheets,
    specs,
  })

  reportKeySyncPlan(plan, dryRun)

  if (plan.conflicts > 0 && !dryRun) {
    console.error(
      'Refusing to write because one or more conflicts were detected. Fix conflicts or adjust specs.',
    )
    process.exitCode = 1
    return
  }

  if (dryRun) {
    console.info('Dry-run complete — no Sheet writes performed.')
    return
  }

  if (plan.created === 0 && plan.filled === 0) {
    console.info('Nothing to write — all keys already present or conflicted.')
    return
  }

  const writer = new GoogleSheetsWriter(auth)
  for (const locale of SUPPORTED_LOCALES) {
    const rows = plan.appendsByLocale.get(locale) ?? []
    if (rows.length > 0) {
      console.info(`Appending ${rows.length} row(s) to tab "${locale}"…`)
      await writer.appendLocaleRows(config.spreadsheetId, locale, rows)
    }
    const fills = plan.fillsByLocale.get(locale) ?? []
    for (const fill of fills) {
      console.info(
        `Filling blank ${locale} cell at row ${fill.rowNumber}…`,
      )
      await writer.updateLocaleCell(
        config.spreadsheetId,
        locale,
        fill.rowNumber,
        fill.localeValue,
      )
    }
  }

  console.info('Key sync completed successfully.')
  console.info(
    'Next: fill remaining locale cells if desired, then run npm run export:i18n.',
  )
}

async function main(): Promise<void> {
  try {
    await runSyncKeys()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`i18n key sync failed: ${message}`)
    process.exitCode = 1
  }
}

const isDirectCliRun =
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href ===
    pathToFileURL(fileURLToPath(import.meta.url)).href

if (isDirectCliRun) {
  void main()
}
