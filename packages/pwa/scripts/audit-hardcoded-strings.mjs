#!/usr/bin/env node
/**
 * Soft audit for likely Dutch hardcoded UI strings under packages/pwa/src.
 *
 * Limitations (intentional — do NOT treat as a CI gate):
 * - Heuristic word list; misses short/ambiguous Dutch and false-positives on
 *   brand names (Apotheker/Bezorger as roles), test fixtures, comments,
 *   backend enum labels, and locale JSON catalogs.
 * - Does not parse Vue templates deeply; scans raw file text line-by-line.
 * - Report-only: always exits 0. Review candidates manually before migrating.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC_ROOT = path.resolve(__dirname, '../src')

/** Common Dutch UI words / fragments unlikely in pure English source. */
const DUTCH_HINT =
  /(?:^|[^A-Za-z])(inloggen|uitloggen|wachtwoord|bestelling(?:en)?|voorraad(?:beheer)?|instellingen|meldingen|geannuleerd|geleverd|toegewezen|onvoldoende|probeer|opnieuw|verplicht|selecteer|annuleren|bevestig|foutmelding|e-mailadres|geen toegang|hoofdnavigatie|nieuwe bestelling|mijn bestellingen|applicatie-instellingen|onjuiste inloggegevens)(?:[^A-Za-z]|$)/i

const SKIP_DIRS = new Set([
  'locales',
  'node_modules',
  'dist',
  '__snapshots__',
])

/** Paths that are expected to contain Dutch or non-UI Dutch-looking tokens. */
function classify(filePath, line) {
  const rel = path.relative(SRC_ROOT, filePath).replaceAll('\\', '/')
  const trimmed = line.trim()

  if (rel.startsWith('locales/')) {
    return 'catalog'
  }
  if (/\.(spec|test)\.[jt]sx?$/.test(rel) || /\/test-utils\.ts$/.test(rel)) {
    return 'test-fixture'
  }
  if (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('<!--')
  ) {
    return 'comment'
  }
  // camelCase / GraphQL identifiers that merely contain Dutch-looking substrings
  if (
    /\b[a-z]+[A-Z][A-Za-z]*\b/.test(line) &&
    !/['"`].*\b(inloggen|wachtwoord|onjuiste|bestelling|voorraad|instellingen)\b/i.test(
      line,
    )
  ) {
    const withoutIdents = line.replace(/\b[A-Za-z][A-Za-z0-9]*\b/g, token =>
      /[A-Z]/.test(token.slice(1)) ? '' : token,
    )
    if (!DUTCH_HINT.test(withoutIdents)) {
      return 'identifier-false-positive'
    }
  }
  if (/t\(['"`]|translate\(|translatePlural\(/.test(line)) {
    return 'already-i18n-key-call'
  }
  if (/['"`].*\b(PENDING|DELIVERED|CANCELLED|ASSIGNED)\b/.test(line)) {
    return 'backend-enum'
  }
  return 'candidate'
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
      continue
    }
    if (!/\.(vue|ts|tsx|js|mjs)$/.test(entry.name)) continue
    if (entry.name.endsWith('.d.ts')) continue
    out.push(full)
  }
  return out
}

const files = walk(SRC_ROOT)
const byClass = {
  candidate: [],
  'test-fixture': [],
  comment: [],
  'identifier-false-positive': [],
  'backend-enum': [],
  'already-i18n-key-call': [],
  catalog: [],
}

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  lines.forEach((line, idx) => {
    if (!DUTCH_HINT.test(line)) return
    const kind = classify(file, line)
    byClass[kind].push({
      file: path.relative(SRC_ROOT, file).replaceAll('\\', '/'),
      line: idx + 1,
      text: line.trim().slice(0, 160),
    })
  })
}

console.log('=== Hardcoded Dutch string audit (soft / report-only) ===')
console.log(`Scanned: ${files.length} vue/ts files under src/`)
console.log('')

for (const [kind, rows] of Object.entries(byClass)) {
  console.log(`## ${kind} (${rows.length})`)
  for (const row of rows.slice(0, 40)) {
    console.log(`  ${row.file}:${row.line}: ${row.text}`)
  }
  if (rows.length > 40) {
    console.log(`  … +${rows.length - 40} more`)
  }
  console.log('')
}

console.log(
  `Summary: ${byClass.candidate.length} migration candidates (manual review). Exit 0.`,
)
process.exit(0)
