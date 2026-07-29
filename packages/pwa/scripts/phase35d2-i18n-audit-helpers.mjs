/**
 * Shared helpers for phase35d2-i18n-audit (CLI + tests).
 * Snapshot comparison is test/internal only — never wired into --check.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PWA_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(PWA_ROOT, '../..')

export const CSV_REPO_PATH = 'artifacts/i18n-sheet-import.csv'
export const SUMMARY_REPO_PATH = 'artifacts/i18n-audit-summary.json'
export const MD_REPO_PATH = 'docs/i18n-audit.md'

export function normalizeNewlines(text) {
  return String(text).replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

export function finalizeContent(content) {
  const next = normalizeNewlines(content)
  return next.endsWith('\n') ? next : `${next}\n`
}

export function readNormalizedFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null
  }
  return finalizeContent(fs.readFileSync(filePath, 'utf8'))
}

export function resolveArtefactPaths(outDir) {
  const root = outDir ? path.resolve(outDir) : REPO_ROOT
  return {
    root,
    csv: path.join(root, ...CSV_REPO_PATH.split('/')),
    summary: path.join(root, ...SUMMARY_REPO_PATH.split('/')),
    md: path.join(root, ...MD_REPO_PATH.split('/')),
  }
}

/**
 * Localisation health failures from an audit scan object (no disk I/O).
 * @returns {string[]}
 */
export function validateLocalisation(scan) {
  const failures = []

  if (scan.uniqueMissingKeys.length > 0) {
    failures.push(
      `Missing catalogue keys used by UI (${scan.uniqueMissingKeys.length}): ${scan.uniqueMissingKeys.slice(0, 12).join(', ')}${scan.uniqueMissingKeys.length > 12 ? ', ...' : ''}`,
    )
  }

  if (scan.placeholderMismatches.length > 0) {
    failures.push(
      `Placeholder parity mismatches (${scan.placeholderMismatches.length})`,
    )
  }

  if (scan.rawKeyRisks.length > 0) {
    failures.push(
      `Known raw-key rendering risks (${scan.rawKeyRisks.length})`,
    )
  }

  if (scan.hardcodedNonAllowlisted.length > 0) {
    failures.push(
      `Confirmed hard-coded visible text candidates (${scan.hardcodedNonAllowlisted.length})`,
    )
    for (const hit of scan.hardcodedNonAllowlisted.slice(0, 10)) {
      failures.push(`  - ${hit.file}:${hit.line}: ${hit.text}`)
    }
  }

  if (scan.statusEnumKeysMissing.length > 0) {
    failures.push(
      `Status/enum mapping keys missing or empty (${scan.statusEnumKeysMissing.length}): ${scan.statusEnumKeysMissing.join(', ')}`,
    )
  }

  return failures
}

/**
 * Compare generated artefact bytes to on-disk files. Never writes.
 * Not used by audit:i18n:check.
 * @returns {string[]} stale repo-relative paths (empty when current)
 */
export function compareSnapshots(paths, contents) {
  const comparisons = [
    { repoPath: CSV_REPO_PATH, filePath: paths.csv, expected: contents.csv },
    {
      repoPath: SUMMARY_REPO_PATH,
      filePath: paths.summary,
      expected: contents.summaryJson,
    },
    { repoPath: MD_REPO_PATH, filePath: paths.md, expected: contents.md },
  ]

  const stale = []
  for (const item of comparisons) {
    const onDisk = readNormalizedFile(item.filePath)
    if (onDisk === null) {
      stale.push(`${item.repoPath} (missing)`)
      continue
    }
    if (onDisk !== item.expected) {
      stale.push(item.repoPath)
    }
  }
  return stale
}
