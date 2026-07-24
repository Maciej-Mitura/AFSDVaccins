import type { SupportedLocale } from './config.js'

/** Dot-separated translation keys: letters, digits, hyphen, underscore per segment. */
export const TRANSLATION_KEY_PATTERN = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/

export interface TranslationRow {
  key: string
  /** Effective exported translation (locale column C, or Default fallback). */
  translation: string
  /** True when column C was blank and Default (column B) was used. */
  usedFallback: boolean
  /** 1-based spreadsheet row number */
  rowNumber: number
}

export interface LocaleTranslations {
  locale: SupportedLocale
  rows: TranslationRow[]
  byKey: Map<string, TranslationRow>
  fallbackCount: number
}

export interface ValidationIssue {
  locale?: SupportedLocale
  rowNumber?: number
  message: string
}

export class TranslationValidationError extends Error {
  readonly issues: ValidationIssue[]

  constructor(issues: ValidationIssue[]) {
    const summary = issues.map(formatIssue).join('\n')
    super(
      `Translation validation failed with ${issues.length} issue(s):\n${summary}`,
    )
    this.name = 'TranslationValidationError'
    this.issues = issues
  }
}

function formatIssue(issue: ValidationIssue): string {
  const parts: string[] = []
  if (issue.locale) {
    parts.push(`[${issue.locale}]`)
  }
  if (issue.rowNumber !== undefined) {
    parts.push(`row ${issue.rowNumber}`)
  }
  parts.push(issue.message)
  return `- ${parts.join(' ')}`
}

export function isBlankCell(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true
  }
  if (typeof value === 'string') {
    return value.trim() === ''
  }
  // Numbers (including 0) and booleans (including false) are meaningful values.
  return false
}

export function cellToTrimmedString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'bigint') {
    return value.toString()
  }
  return ''
}

export function isEmptySheetRow(row: unknown[] | undefined): boolean {
  if (!row || row.length === 0) {
    return true
  }
  return row.every(cell => isBlankCell(cell))
}

export function formatObservedHeaders(row: unknown[] | undefined): string {
  const cells = row ?? []
  const a = cellToTrimmedString(cells[0]) || '(empty)'
  const b = cellToTrimmedString(cells[1]) || '(empty)'
  const c = cellToTrimmedString(cells[2]) || '(empty)'
  return `${a} | ${b} | ${c}`
}

/**
 * Preferred teacher-compatible header: Key | Default | {locale}
 * Optional legacy alias: Key | Default | Translation
 */
export function isRecognizedHeaderRow(
  row: unknown[],
  locale: SupportedLocale,
): boolean {
  if (!row || row.length < 3) {
    return false
  }
  const keyHeader = cellToTrimmedString(row[0]).toLowerCase()
  const defaultHeader = cellToTrimmedString(row[1]).toLowerCase()
  const thirdHeader = cellToTrimmedString(row[2]).toLowerCase()

  const keyOk = keyHeader === 'key'
  const defaultOk = defaultHeader === 'default'
  const thirdOk =
    thirdHeader === locale.toLowerCase() || thirdHeader === 'translation'

  return keyOk && defaultOk && thirdOk
}

export function describeExpectedHeader(locale: SupportedLocale): string {
  return `Key | Default | ${locale}`
}

export function isValidTranslationKey(key: string): boolean {
  return TRANSLATION_KEY_PATTERN.test(key)
}

/** Extract `{placeholder}` names preserving multiplicity (multiset). */
export function extractPlaceholders(text: string): string[] {
  const names: string[] = []
  const pattern = /\{([^{}]+)\}/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    names.push(match[1])
  }
  return names
}

export function placeholdersEqualMultiset(a: string, b: string): boolean {
  const left = extractPlaceholders(a).slice().sort()
  const right = extractPlaceholders(b).slice().sort()
  if (left.length !== right.length) {
    return false
  }
  return left.every((name, index) => name === right[index])
}

export function parseLocaleSheetRows(
  locale: SupportedLocale,
  values: unknown[][] | null | undefined,
): { rows: TranslationRow[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = []
  const rows: TranslationRow[] = []

  if (!values || values.length === 0) {
    issues.push({
      locale,
      message:
        'Worksheet is empty; expected a header row and translation rows.',
    })
    return { rows, issues }
  }

  if (!isRecognizedHeaderRow(values[0] ?? [], locale)) {
    issues.push({
      locale,
      rowNumber: 1,
      message:
        `expected headers ${describeExpectedHeader(locale)} ` +
        `(or Key | Default | Translation); got ${formatObservedHeaders(values[0])}.`,
    })
    return { rows, issues }
  }

  for (let index = 1; index < values.length; index += 1) {
    const rowNumber = index + 1
    const row = values[index] ?? []

    if (isEmptySheetRow(row)) {
      // Completely empty rows (including trailing blanks from Sheets) are ignored.
      continue
    }

    const keyRaw = row[0]
    const defaultRaw = row[1]
    const translationRaw = row[2]
    const keyBlank = isBlankCell(keyRaw)
    const defaultBlank = isBlankCell(defaultRaw)
    const translationBlank = isBlankCell(translationRaw)

    if (keyBlank) {
      issues.push({
        locale,
        rowNumber,
        message: 'Key (column A) is required for partially populated rows.',
      })
      continue
    }

    if (defaultBlank && translationBlank) {
      issues.push({
        locale,
        rowNumber,
        message:
          'Both Default (column B) and locale translation (column C) are blank.',
      })
      continue
    }

    if (defaultBlank) {
      issues.push({
        locale,
        rowNumber,
        message:
          'Default (column B) is required for every non-empty translation row ' +
          '(export-time fallback source), even when column C has a value.',
      })
      continue
    }

    const key = cellToTrimmedString(keyRaw)
    const defaultValue = cellToTrimmedString(defaultRaw)
    const localeValue = cellToTrimmedString(translationRaw)
    const usedFallback = translationBlank
    const translation = usedFallback ? defaultValue : localeValue

    if (!isValidTranslationKey(key)) {
      issues.push({
        locale,
        rowNumber,
        message:
          `Invalid translation key "${key}". Expected domain dot-notation ` +
          `(e.g. common.save); letters, digits, hyphen, underscore per segment; ` +
          `no whitespace, leading/trailing dots, empty segments, or consecutive dots.`,
      })
      continue
    }

    rows.push({ key, translation, usedFallback, rowNumber })
  }

  return { rows, issues }
}

export function detectDuplicateKeys(
  locale: SupportedLocale,
  rows: TranslationRow[],
): ValidationIssue[] {
  const seen = new Map<string, number[]>()
  for (const row of rows) {
    const list = seen.get(row.key) ?? []
    list.push(row.rowNumber)
    seen.set(row.key, list)
  }

  const issues: ValidationIssue[] = []
  for (const [key, rowNumbers] of seen) {
    if (rowNumbers.length > 1) {
      issues.push({
        locale,
        message: `Duplicate key "${key}" at rows ${rowNumbers.join(' and ')}.`,
      })
    }
  }
  return issues
}

export function buildLocaleTranslations(
  locale: SupportedLocale,
  rows: TranslationRow[],
): LocaleTranslations {
  const byKey = new Map<string, TranslationRow>()
  let fallbackCount = 0
  for (const row of rows) {
    byKey.set(row.key, row)
    if (row.usedFallback) {
      fallbackCount += 1
    }
  }
  return { locale, rows, byKey, fallbackCount }
}

export function compareLocaleKeySets(
  locales: LocaleTranslations[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (locales.length < 2) {
    return issues
  }

  const allKeys = new Set<string>()
  for (const locale of locales) {
    for (const key of locale.byKey.keys()) {
      allKeys.add(key)
    }
  }

  for (const locale of locales) {
    const missing = [...allKeys].filter(key => !locale.byKey.has(key)).sort()
    if (missing.length > 0) {
      issues.push({
        locale: locale.locale,
        message: `Missing key(s): ${missing.join(', ')}`,
      })
    }
  }

  return issues
}

export function comparePlaceholdersAcrossLocales(
  locales: LocaleTranslations[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (locales.length < 2) {
    return issues
  }

  const [reference, ...others] = locales
  for (const key of [...reference.byKey.keys()].sort()) {
    const refRow = reference.byKey.get(key)
    if (!refRow) {
      continue
    }
    for (const other of others) {
      const otherRow = other.byKey.get(key)
      if (!otherRow) {
        continue
      }
      if (
        !placeholdersEqualMultiset(refRow.translation, otherRow.translation)
      ) {
        issues.push({
          message:
            `Placeholder multiset mismatch for key "${key}" between ` +
            `${reference.locale} (row ${refRow.rowNumber}) and ` +
            `${other.locale} (row ${otherRow.rowNumber}).`,
        })
      }
    }
  }

  return issues
}

export function validateTranslationLocales(
  sheets: Array<{
    locale: SupportedLocale
    values: unknown[][] | null | undefined
  }>,
): LocaleTranslations[] {
  const issues: ValidationIssue[] = []
  const locales: LocaleTranslations[] = []

  for (const sheet of sheets) {
    const parsed = parseLocaleSheetRows(sheet.locale, sheet.values)
    const duplicates = detectDuplicateKeys(sheet.locale, parsed.rows)
    issues.push(...parsed.issues)
    issues.push(...duplicates)
    if (parsed.issues.length === 0 && duplicates.length === 0) {
      locales.push(buildLocaleTranslations(sheet.locale, parsed.rows))
    }
  }

  if (locales.length === sheets.length) {
    issues.push(...compareLocaleKeySets(locales))
    issues.push(...comparePlaceholdersAcrossLocales(locales))
  }

  if (issues.length > 0) {
    throw new TranslationValidationError(issues)
  }

  return locales
}

export function toSortedMessageMap(
  locale: LocaleTranslations,
): Record<string, string> {
  const entries = [...locale.byKey.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )
  const messages: Record<string, string> = {}
  for (const [key, row] of entries) {
    messages[key] = row.translation
  }
  return messages
}

export function formatLocaleJson(
  locale: SupportedLocale,
  messages: Record<string, string>,
): string {
  const wrapper: Record<string, Record<string, string>> = {
    [locale]: messages,
  }
  return `${JSON.stringify(wrapper, null, 2)}\n`
}
