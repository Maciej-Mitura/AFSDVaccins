import { google, type sheets_v4 } from 'googleapis'

import type { SheetsAuthClient } from './auth-types.js'
import type { SupportedLocale } from './config.js'

export interface SheetWriter {
  appendLocaleRows(
    spreadsheetId: string,
    locale: SupportedLocale,
    rows: string[][],
  ): Promise<void>
  updateLocaleCell(
    spreadsheetId: string,
    locale: SupportedLocale,
    rowNumber: number,
    localeValue: string,
  ): Promise<void>
}

/**
 * Write-capable Sheets client — used only by explicit sync/seed commands.
 * Normal `export:i18n` must keep using {@link GoogleSheetsReader} (values.get).
 */
export class GoogleSheetsWriter implements SheetWriter {
  private readonly sheets: sheets_v4.Sheets

  constructor(auth: SheetsAuthClient) {
    this.sheets = google.sheets({
      version: 'v4',
      auth: auth as unknown as sheets_v4.Options['auth'],
    })
  }

  async appendLocaleRows(
    spreadsheetId: string,
    locale: SupportedLocale,
    rows: string[][],
  ): Promise<void> {
    if (rows.length === 0) {
      return
    }

    await this.sheets.spreadsheets.values.append({
      spreadsheetId,
      range: locale,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: rows,
      },
    })
  }

  /**
   * Set column C (locale translation) for an existing 1-based row.
   * Used only to fill previously blank cells when a value is explicitly supplied.
   */
  async updateLocaleCell(
    spreadsheetId: string,
    locale: SupportedLocale,
    rowNumber: number,
    localeValue: string,
  ): Promise<void> {
    await this.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${locale}!C${rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[localeValue]],
      },
    })
  }
}
