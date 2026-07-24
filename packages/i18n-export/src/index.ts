import { authorizeGoogleSheets } from './authorize.js'
import {
  assertCredentialsPresent,
  loadExporterConfig,
  SUPPORTED_LOCALES,
} from './config.js'
import {
  reportSafeExportSummary,
  writeValidatedLocaleFiles,
} from './generate-translations.js'
import { GoogleSheetsReader, readSupportedLocaleTabs } from './sheet-reader.js'
import { validateTranslationLocales } from './translation-validator.js'

export async function runExport(): Promise<void> {
  const config = loadExporterConfig()
  assertCredentialsPresent(config.credentialsPath)

  console.info('Authenticating with Google Sheets (readonly export)…')
  const auth = await authorizeGoogleSheets({
    credentialsPath: config.credentialsPath,
    tokenPath: config.tokenPath,
    mode: 'readonly',
  })

  const reader = new GoogleSheetsReader(auth)
  console.info(
    `Reading tabs ${SUPPORTED_LOCALES.join(', ')} from spreadsheet (id length ${config.spreadsheetId.length})…`,
  )

  const sheets = await readSupportedLocaleTabs(
    reader,
    config.spreadsheetId,
    SUPPORTED_LOCALES,
  )

  const locales = validateTranslationLocales(sheets)
  const result = await writeValidatedLocaleFiles({
    locales,
    distLocalesDir: config.distLocalesDir,
    pwaLocalesDir: config.pwaLocalesDir,
  })

  reportSafeExportSummary(result)
  console.info('Export completed successfully.')
}

async function main(): Promise<void> {
  try {
    await runExport()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`i18n export failed: ${message}`)
    process.exitCode = 1
  }
}

void main()
