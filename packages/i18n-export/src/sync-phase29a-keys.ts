/**
 * Sync Phase 29A manifest-download keys to Google Sheets, then export locale JSON.
 * Run: npm exec --workspace=@vaccin-delivery/i18n-export -- tsx src/sync-phase29a-keys.ts
 */
import { authorizeGoogleSheets } from './authorize.js'
import {
  assertCredentialsPresent,
  loadExporterConfig,
  SUPPORTED_LOCALES,
} from './config.js'
import { GoogleSheetsReader, readSupportedLocaleTabs } from './sheet-reader.js'
import { GoogleSheetsWriter } from './sheet-writer.js'
import {
  planKeySync,
  reportKeySyncPlan,
  type KeySyncSpec,
} from './sync-keys-logic.js'
import { PHASE_29A_I18N_KEYS } from './phase29a-keys.js'

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--preview')
  const config = loadExporterConfig()
  assertCredentialsPresent(config.credentialsPath)

  const specs: KeySyncSpec[] = PHASE_29A_I18N_KEYS.map(entry => ({
    key: entry.key,
    defaultValue: entry.en,
    localeValues: {
      en: entry.en,
      nl: entry.nl,
      // es/zh: leave blank → Default (English) fallback policy
    },
  }))

  console.info(
    dryRun
      ? `Planning ${specs.length} Phase 29A keys (preview)…`
      : `Syncing ${specs.length} Phase 29A keys…`,
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
    throw new Error(
      `Refusing to sync: ${plan.conflicts} conflict(s). Resolve sheet conflicts first.`,
    )
  }

  if (dryRun) {
    console.info('Preview only — no sheet writes.')
    return
  }

  if (plan.created === 0 && plan.filled === 0) {
    console.info('Nothing to write — all keys already present or conflicted.')
  } else {
    const writer = new GoogleSheetsWriter(auth)
    for (const locale of SUPPORTED_LOCALES) {
      const rows = plan.appendsByLocale.get(locale) ?? []
      if (rows.length > 0) {
        console.info(`Appending ${rows.length} row(s) to tab "${locale}"…`)
        await writer.appendLocaleRows(config.spreadsheetId, locale, rows)
      }
      const fills = plan.fillsByLocale.get(locale) ?? []
      for (const fill of fills) {
        console.info(`Filling blank ${locale} cell at row ${fill.rowNumber}…`)
        await writer.updateLocaleCell(
          config.spreadsheetId,
          locale,
          fill.rowNumber,
          fill.localeValue,
        )
      }
    }
  }

  console.info('Phase 29A key sync complete. Run npm run export:i18n next.')
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
