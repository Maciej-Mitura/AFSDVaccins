import type { SupportedLocale } from './config.js'
import {
  cellToTrimmedString,
  isBlankCell,
  isEmptySheetRow,
  isRecognizedHeaderRow,
  isValidTranslationKey,
} from './translation-validator.js'

export interface KeySyncSpec {
  key: string
  /** Required Default (column B) for every new row. */
  defaultValue: string
  /**
   * Optional locale column C values. Omitted / blank locales leave column C
   * empty so export uses Default fallback.
   */
  localeValues?: Partial<Record<SupportedLocale, string>>
}

export type KeySyncAction = 'create' | 'skip' | 'conflict' | 'fill-locale'

export interface KeySyncTabDecision {
  locale: SupportedLocale
  key: string
  action: KeySyncAction
  /** Row to append when action is create: [Key, Default, localeOrBlank]. */
  row?: [string, string, string]
  /** 1-based row + locale cell when filling a blank column C. */
  fill?: { rowNumber: number; localeValue: string }
  reason: string
}

export interface KeySyncPlan {
  decisions: KeySyncTabDecision[]
  created: number
  skipped: number
  conflicts: number
  filled: number
  /** Rows to append per locale tab (create actions only). */
  appendsByLocale: Map<SupportedLocale, string[][]>
  /** Blank locale cells to fill when explicitly supplied. */
  fillsByLocale: Map<
    SupportedLocale,
    Array<{ rowNumber: number; localeValue: string }>
  >
}

export interface ExistingKeyRow {
  key: string
  defaultValue: string
  localeValue: string
  localeBlank: boolean
  rowNumber: number
}

/**
 * Index existing Key / Default / locale cells after a recognized header row.
 * Does not mutate sheet data; used only for sync planning.
 */
export function indexExistingKeyRows(
  locale: SupportedLocale,
  values: unknown[][] | null | undefined,
): { headerOk: boolean; byKey: Map<string, ExistingKeyRow>; error?: string } {
  const byKey = new Map<string, ExistingKeyRow>()

  if (!values || values.length === 0) {
    return {
      headerOk: false,
      byKey,
      error: `Worksheet "${locale}" is empty; expected header ${describeSyncHeader(locale)}.`,
    }
  }

  if (!isRecognizedHeaderRow(values[0] ?? [], locale)) {
    return {
      headerOk: false,
      byKey,
      error: `Worksheet "${locale}" has unrecognized headers; expected Key | Default | ${locale}.`,
    }
  }

  for (let index = 1; index < values.length; index += 1) {
    const row = values[index] ?? []
    if (isEmptySheetRow(row)) {
      continue
    }
    if (isBlankCell(row[0])) {
      continue
    }
    const key = cellToTrimmedString(row[0])
    if (!key) {
      continue
    }
    // First occurrence wins for planning (duplicates are an export-time error).
    if (byKey.has(key)) {
      continue
    }
    byKey.set(key, {
      key,
      defaultValue: cellToTrimmedString(row[1]),
      localeValue: cellToTrimmedString(row[2]),
      localeBlank: isBlankCell(row[2]),
      rowNumber: index + 1,
    })
  }

  return { headerOk: true, byKey }
}

export function describeSyncHeader(locale: SupportedLocale): string {
  return `Key | Default | ${locale}`
}

function localeCellForSpec(
  locale: SupportedLocale,
  spec: KeySyncSpec,
): string {
  const raw = spec.localeValues?.[locale]
  if (raw === undefined) {
    return ''
  }
  return raw.trim()
}

/**
 * Plan idempotent key-row creation across locale tabs.
 * - Missing key → create with Key + Default; locale cell blank unless supplied.
 * - Existing key with same Default → skip (never overwrite nonblank translations).
 * - Existing key with different Default → conflict (no write).
 */
export function planKeySync(options: {
  locales: readonly SupportedLocale[]
  sheets: Array<{
    locale: SupportedLocale
    values: unknown[][] | null | undefined
  }>
  specs: KeySyncSpec[]
}): KeySyncPlan {
  const { locales, sheets, specs } = options
  const indexed = new Map<
    SupportedLocale,
    ReturnType<typeof indexExistingKeyRows>
  >()

  for (const sheet of sheets) {
    indexed.set(sheet.locale, indexExistingKeyRows(sheet.locale, sheet.values))
  }

  const decisions: KeySyncTabDecision[] = []
  const appendsByLocale = new Map<SupportedLocale, string[][]>()
  const fillsByLocale = new Map<
    SupportedLocale,
    Array<{ rowNumber: number; localeValue: string }>
  >()

  for (const locale of locales) {
    appendsByLocale.set(locale, [])
    fillsByLocale.set(locale, [])
  }

  for (const spec of specs) {
    const key = spec.key.trim()
    const defaultValue = spec.defaultValue.trim()

    if (!isValidTranslationKey(key)) {
      for (const locale of locales) {
        decisions.push({
          locale,
          key,
          action: 'conflict',
          reason: `Invalid translation key "${key}".`,
        })
      }
      continue
    }

    if (!defaultValue) {
      for (const locale of locales) {
        decisions.push({
          locale,
          key,
          action: 'conflict',
          reason: 'Default value is required and must be nonblank.',
        })
      }
      continue
    }

    for (const locale of locales) {
      const tab = indexed.get(locale)
      if (!tab?.headerOk) {
        decisions.push({
          locale,
          key,
          action: 'conflict',
          reason: tab?.error ?? `Worksheet "${locale}" could not be indexed.`,
        })
        continue
      }

      const existing = tab.byKey.get(key)
      if (!existing) {
        const localeCell = localeCellForSpec(locale, spec)
        const row: [string, string, string] = [key, defaultValue, localeCell]
        decisions.push({
          locale,
          key,
          action: 'create',
          row,
          reason: localeCell
            ? `Will append row with locale cell set for ${locale}.`
            : `Will append row with blank ${locale} cell (Default fallback).`,
        })
        appendsByLocale.get(locale)?.push(row)
        continue
      }

      if (existing.defaultValue !== defaultValue) {
        decisions.push({
          locale,
          key,
          action: 'conflict',
          reason:
            `Key already exists at row ${existing.rowNumber} with different Default ` +
            `("${existing.defaultValue}" vs "${defaultValue}"). Not overwriting.`,
        })
        continue
      }

      const desiredLocale = localeCellForSpec(locale, spec)
      if (desiredLocale && existing.localeBlank) {
        decisions.push({
          locale,
          key,
          action: 'fill-locale',
          fill: { rowNumber: existing.rowNumber, localeValue: desiredLocale },
          reason: `Will fill blank ${locale} cell at row ${existing.rowNumber} with explicit value.`,
        })
        fillsByLocale.get(locale)?.push({
          rowNumber: existing.rowNumber,
          localeValue: desiredLocale,
        })
        continue
      }

      decisions.push({
        locale,
        key,
        action: 'skip',
        reason: existing.localeBlank
          ? `Key already present at row ${existing.rowNumber} with matching Default (locale cell blank).`
          : `Key already present at row ${existing.rowNumber} with matching Default (locale translation kept).`,
      })
    }
  }

  let created = 0
  let skipped = 0
  let conflicts = 0
  let filled = 0
  for (const decision of decisions) {
    if (decision.action === 'create') {
      created += 1
    } else if (decision.action === 'skip') {
      skipped += 1
    } else if (decision.action === 'fill-locale') {
      filled += 1
    } else {
      conflicts += 1
    }
  }

  return {
    decisions,
    created,
    skipped,
    conflicts,
    filled,
    appendsByLocale,
    fillsByLocale,
  }
}

export function reportKeySyncPlan(plan: KeySyncPlan, dryRun: boolean): void {
  const mode = dryRun ? 'DRY-RUN' : 'WRITE'
  console.info(`i18n key sync (${mode})`)
  console.info(
    `Summary: created=${plan.created}, skipped=${plan.skipped}, filled=${plan.filled}, conflicts=${plan.conflicts}`,
  )

  for (const decision of plan.decisions) {
    const tag = decision.action.toUpperCase()
    console.info(
      `[${tag}] ${decision.locale} ${decision.key}: ${decision.reason}`,
    )
  }
}
