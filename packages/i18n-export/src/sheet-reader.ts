import { google, type sheets_v4 } from 'googleapis'

import type { SheetsAuthClient } from './auth-types.js'
import type { SupportedLocale } from './config.js'

export interface SheetReader {
  readLocaleTab(
    spreadsheetId: string,
    locale: SupportedLocale,
  ): Promise<unknown[][] | null | undefined>
}

export class GoogleSheetsReader implements SheetReader {
  private readonly sheets: sheets_v4.Sheets

  constructor(auth: SheetsAuthClient) {
    // googleapis bundles its own google-auth-library copy; cast at the boundary.
    this.sheets = google.sheets({
      version: 'v4',
      auth: auth as unknown as sheets_v4.Options['auth'],
    })
  }

  async readLocaleTab(
    spreadsheetId: string,
    locale: SupportedLocale,
  ): Promise<unknown[][] | null | undefined> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId,
      range: locale,
      majorDimension: 'ROWS',
    })
    return response.data.values as unknown[][] | null | undefined
  }
}

export async function readSupportedLocaleTabs(
  reader: SheetReader,
  spreadsheetId: string,
  locales: readonly SupportedLocale[],
): Promise<Array<{ locale: SupportedLocale; values: unknown[][] | null | undefined }>> {
  const results: Array<{
    locale: SupportedLocale
    values: unknown[][] | null | undefined
  }> = []

  for (const locale of locales) {
    const values = await reader.readLocaleTab(spreadsheetId, locale)
    results.push({ locale, values })
  }

  return results
}
