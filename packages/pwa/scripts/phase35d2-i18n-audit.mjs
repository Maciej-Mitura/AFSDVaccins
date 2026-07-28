#!/usr/bin/env node
/**
 * Phase 35D2 — deterministic localisation audit + spreadsheet-ready CSV export.
 *
 * Outputs (repo-relative):
 *   - docs/i18n-audit.md
 *   - artifacts/i18n-sheet-import.csv
 *   - artifacts/i18n-audit-summary.json (machine-readable; deterministic)
 *
 * Does NOT call Google Sheets. Does NOT mutate locale JSON.
 * Exit 0 on success; exit 1 only on internal failures (parity crash, IO).
 *
 * Usage:
 *   node packages/pwa/scripts/phase35d2-i18n-audit.mjs
 *   npm run audit:i18n --workspace=@vaccin-delivery/pwa
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PWA_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(PWA_ROOT, '../..')
const SRC_ROOT = path.join(PWA_ROOT, 'src')
const LOCALES_DIR = path.join(SRC_ROOT, 'locales')
const ARTIFACTS_DIR = path.join(REPO_ROOT, 'artifacts')
const DOCS_DIR = path.join(REPO_ROOT, 'docs')

const LOCALES = ['nl', 'en', 'es', 'zh']
const PLACEHOLDER_RE = /\{[^}]+\}/g

/** Keys that may legitimately match English in nl (brand / loanwords / short labels). */
const NL_SAME_AS_EN_ALLOWLIST = new Set([
  'account.realtime',
  'app.title',
  'common.ok',
  'common.qr',
  'common.email',
  'status.api.ok',
  'status.api.degraded',
  'pwa.install',
])

import { PROPOSED_ADDITIONS as BASE_PROPOSED_ADDITIONS } from './phase35d2-proposed-additions.mjs'

/** Feature dirs audited for hard-coded English UI literals (allowlisted exceptions OK). */
const HARDCODED_AUDIT_GLOBS = [
  'components/feature/admin/analytics',
  'components/feature/voice-report',
  'components/feature/order-history',
  'components/feature/notifications',
  'components/feature/bezorger',
  'components/feature/auth',
  'components/common',
  'views/admin',
  'views/bezorger',
  'views/apotheker',
  'views/auth',
  'views/profile',
  'utils/notification-display.ts',
  'composables/courier-analytics-mappers.ts',
  'composables/voice-report',
]

/**
 * Allowlist: path substring + regex that may contain hard-coded user text.
 * Keep narrow — only justified remaining exceptions after Phase 35D3.
 */
const HARDCODED_ALLOWLIST = [
  {
    pathIncludes: 'supported-locales.ts',
    pattern: /Nederlands|English|Español|中文/,
    reason: 'Language endonyms are intentional',
  },
]

const ENGLISH_UI_HINT =
  /(?<![A-Za-z])(Loading\.\.\.|Something went wrong|Try again|No results|Click here|Save changes|Sign in|Sign out|Log in|Log out|Unable to |Failed to |Please |Welcome back)(?![A-Za-z])/

function unwrapCatalog(locale, raw) {
  if (raw && typeof raw === 'object' && raw[locale] && typeof raw[locale] === 'object') {
    return raw[locale]
  }
  return raw
}

function loadCatalogs() {
  const catalogs = {}
  for (const locale of LOCALES) {
    const raw = JSON.parse(
      fs.readFileSync(path.join(LOCALES_DIR, `${locale}.json`), 'utf8'),
    )
    catalogs[locale] = unwrapCatalog(locale, raw)
  }
  return catalogs
}

function placeholderMultiset(value) {
  return [...String(value ?? '').matchAll(PLACEHOLDER_RE)].map(m => m[0]).sort()
}

function walkSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['locales', 'node_modules', 'dist', '__snapshots__'].includes(entry.name)) {
      continue
    }
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkSourceFiles(full, out)
      continue
    }
    if (!/\.(vue|ts|tsx|js|mjs)$/.test(entry.name)) continue
    if (entry.name.endsWith('.d.ts')) continue
    out.push(full)
  }
  return out
}

function relSrc(file) {
  return path.relative(SRC_ROOT, file).replaceAll('\\', '/')
}

function isTestFile(rel) {
  return /\.(spec|test)\.[jt]sx?$/.test(rel) || rel.endsWith('test-utils.ts')
}

function looksLikeI18nKey(key) {
  return /^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+)+$/.test(key)
}

function collectKeyUsages(files) {
  const used = new Map() // key -> Set of files
  const missing = []
  // Word-boundary on bare `t` so `get(` / `await(` are not matched.
  const callRe =
    /(?:\$t|(?<![A-Za-z0-9_])t|translate|translatePlural)\(\s*['"`]([^'"`]+)['"`]/g

  for (const file of files) {
    const rel = relSrc(file)
    const text = fs.readFileSync(file, 'utf8')
    let m
    while ((m = callRe.exec(text))) {
      const key = m[1]
      if (!looksLikeI18nKey(key)) continue
      if (!used.has(key)) used.set(key, new Set())
      used.get(key).add(rel)
    }
  }

  // Also harvest string literals that exactly match catalog keys (status maps, etc.)
  const catalogs = loadCatalogs()
  const catalogKeys = new Set(Object.keys(catalogs.en))
  const literalRe = /['"`]([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+)+)['"`]/g
  for (const file of files) {
    const rel = relSrc(file)
    if (isTestFile(rel)) continue
    const text = fs.readFileSync(file, 'utf8')
    let m
    while ((m = literalRe.exec(text))) {
      const key = m[1]
      if (catalogKeys.has(key)) {
        if (!used.has(key)) used.set(key, new Set())
        used.get(key).add(rel)
      }
    }
  }

  for (const [key, sites] of used) {
    if (!catalogKeys.has(key)) {
      for (const site of sites) {
        if (!isTestFile(site)) {
          missing.push({ key, file: site })
        }
      }
    }
  }

  missing.sort((a, b) => a.key.localeCompare(b.key) || a.file.localeCompare(b.file))
  return { used, missing, catalogKeys }
}

function csvEscape(value) {
  const s = String(value ?? '')
  if (/[",\n\r]/.test(s)) {
    return `"${s.replaceAll('"', '""')}"`
  }
  return s
}

function buildCsvRows(catalogs, unusedKeys, proposedAdditions) {
  const rows = []
  const header = [
    'key',
    'nl',
    'en',
    'es',
    'zh',
    'status',
    'source',
    'notes',
  ]

  for (const add of proposedAdditions) {
    const exists = catalogs.en[add.key] !== undefined
    rows.push({
      key: add.key,
      nl: add.nl || catalogs.nl[add.key] || '',
      en: add.en || catalogs.en[add.key] || '',
      es: add.es || catalogs.es[add.key] || '',
      zh: add.zh || catalogs.zh[add.key] || '',
      status: exists ? 'READY_FOR_SHEET' : 'ADD',
      source: add.source,
      notes: exists
        ? `IMPLEMENTED in runtime catalogs — copy to Sheet then npm run export:i18n. ${add.notes}`
        : add.notes,
    })
  }

  const keys = Object.keys(catalogs.en).sort()
  for (const key of keys) {
    const en = catalogs.en[key]
    const nl = catalogs.nl[key]
    const es = catalogs.es[key]
    const zh = catalogs.zh[key]
    const esClone = es === en && en.length >= 6
    const zhClone = zh === en && en.length >= 6
    const nlClone =
      nl === en && en.length >= 4 && !NL_SAME_AS_EN_ALLOWLIST.has(key)

    if (unusedKeys.has(key)) {
      rows.push({
        key,
        nl,
        en,
        es,
        zh,
        status: 'UNUSED',
        source: 'catalog',
        notes: 'Not referenced by non-test t()/translate()/literal key harvest',
      })
      continue
    }

    if (esClone || zhClone || nlClone) {
      const parts = []
      if (nlClone) parts.push('nl=en')
      if (esClone) parts.push('es=en')
      if (zhClone) parts.push('zh=en')
      rows.push({
        key,
        nl,
        en,
        es,
        zh,
        status: 'REVIEW',
        source: key.split('.')[0],
        notes: `Untranslated or loanword clone (${parts.join(', ')}); human translation recommended`,
      })
    }
  }

  // Stable sort: status order then key
  const statusOrder = {
    ADD: 0,
    READY_FOR_SHEET: 1,
    UPDATE: 2,
    REVIEW: 3,
    UNUSED: 4,
  }
  rows.sort((a, b) => {
    const sa = statusOrder[a.status] ?? 9
    const sb = statusOrder[b.status] ?? 9
    if (sa !== sb) return sa - sb
    return a.key.localeCompare(b.key)
  })

  return { header, rows }
}

/** Write BOM-less UTF-8 so spreadsheet tools keep Chinese/Spanish characters. */
function writeCsv(filePath, header, rows) {
  const lines = [
    header.join(','),
    ...rows.map(row => header.map(col => csvEscape(row[col])).join(',')),
  ]
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, { encoding: 'utf8' })
}

function scanHardcodedCandidates(files) {
  const findings = []
  for (const file of files) {
    const rel = relSrc(file)
    if (isTestFile(rel)) continue
    const inScope = HARDCODED_AUDIT_GLOBS.some(
      g => rel === g || rel.startsWith(g.replace(/\\/g, '/') + '/') || rel.startsWith(g),
    )
    if (!inScope) continue

    const text = fs.readFileSync(file, 'utf8')
    const lines = text.split(/\r?\n/)
    lines.forEach((line, idx) => {
      if (!ENGLISH_UI_HINT.test(line) && !/'A pharmacy'|'Notification'|`\$\{hours\}h /.test(line)) {
        // reset lastIndex for global-ish usage via test
        ENGLISH_UI_HINT.lastIndex = 0
        if (
          !line.includes("'A pharmacy'") &&
          !line.includes("'Notification'") &&
          !/`\$\{hours\}h /.test(line) &&
          !line.includes("'KiB'") &&
          !line.includes('event.message')
        ) {
          return
        }
      }
      ENGLISH_UI_HINT.lastIndex = 0

      if (/t\(['"`]|translate\(|translatePlural\(/.test(line)) return
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) return

      const allowed = HARDCODED_ALLOWLIST.some(
        a => rel.includes(a.pathIncludes) && a.pattern.test(line),
      )
      findings.push({
        file: rel,
        line: idx + 1,
        text: line.trim().slice(0, 160),
        allowlisted: allowed,
      })
    })
  }
  return findings
}

function terminologyNotes(catalogs) {
  const notes = []
  const samples = [
    {
      term: 'courier / bezorger',
      keys: Object.keys(catalogs.en).filter(
        k => /courier|bezorger/i.test(k) || /courier|bezorger/i.test(catalogs.en[k]),
      ),
    },
    {
      term: 'pharmacist / apotheker',
      keys: Object.keys(catalogs.en).filter(
        k =>
          /pharmacist|apotheker|pharmacy/i.test(k) ||
          /pharmacist|apotheker|pharmacy/i.test(catalogs.en[k]),
      ),
    },
  ]

  // Role keys should stay Dutch role nouns in nl
  const roleChecks = [
    ['status.role.bezorger', { nlExpectIncludes: 'Bezorger', enExpectIncludes: 'Courier' }],
    ['status.role.apotheker', { nlExpectIncludes: 'Apotheker', enExpectIncludes: 'Pharmacist' }],
  ]
  for (const [key, expect] of roleChecks) {
    if (!catalogs.nl[key]) {
      notes.push(`Missing role key ${key}`)
      continue
    }
    if (!catalogs.nl[key].includes(expect.nlExpectIncludes)) {
      notes.push(`${key} nl="${catalogs.nl[key]}" may be inconsistent (expected ${expect.nlExpectIncludes})`)
    }
    if (!catalogs.en[key].includes(expect.enExpectIncludes)) {
      notes.push(`${key} en="${catalogs.en[key]}" may be inconsistent (expected ${expect.enExpectIncludes})`)
    }
  }

  notes.push(
    `Courier-related keys: ${samples[0].keys.length}; pharmacist/pharmacy-related keys: ${samples[1].keys.length}. Prefer "bezorger"/"apotheker" in Dutch UI and "courier"/"pharmacist" in English.`,
  )
  return notes
}

function buildMarkdown(report) {
  const {
    keyCounts,
    placeholderMismatches,
    missingKeys,
    unusedKeys,
    sameAsEn,
    csvPath,
    hardcoded,
    sheetsCapability,
    proposedAdditions,
    terminology,
  } = report

  return `# Phase 35D2 — Localisation audit

Generated by \`packages/pwa/scripts/phase35d2-i18n-audit.mjs\` (deterministic; no Google API calls).

## 1. Current localisation architecture

| Item | Detail |
|------|--------|
| Runtime catalogs | \`packages/pwa/src/locales/{nl,en,es,zh}.json\` |
| Library | vue-i18n (composition API, flat keys) |
| Default UI locale | \`nl\` |
| Missing-key fallback | \`en\` |
| Helpers | \`translate\` / \`translatePlural\`, status-labels, format (Intl), error-mapper, validation-schemas |
| Notifications (in-app) | \`titleKey\` / \`bodyKey\` + \`notification-display.ts\` |
| Push (OS) | English templates in API (\`notification-copy.en.ts\`); SW shows payload as sent |
| Offline shell | \`public/offline.html\` embeds nl/en/es/zh statically |

### Data flow

**Primary: spreadsheet → repository** via \`npm run export:i18n\` (Google Sheets **read**, writes locale JSON only).

**Secondary: repository → spreadsheet (keys only)** via \`npm run sync:i18n:keys\` — appends missing Key/Default rows and may fill **blank** locale cells. **Never overwrites non-blank human translations.**

**Not supported:** full catalog write-back / bulk UPDATE of existing Sheet translations.

**Also:** phase \`apply-phase*-locales.ts\` scripts can patch local JSON without Google (bootstrap only).

## 2. Google Sheet read/write capability

| Capability | Status |
|------------|--------|
| Authenticates to Google Sheets | Yes — Desktop OAuth (\`credentials.json\` + cached \`token.json\`) |
| Read access | Yes — \`export:i18n\` uses \`spreadsheets.readonly\` |
| Write access | Yes — \`sync:i18n:keys\` (and phase sync scripts) request \`spreadsheets\` scope |
| Service account | No — interactive OAuth desktop client |
| Idempotent key sync | Yes for create/skip; conflicts block writes |
| Overwrites human cells | **No** — non-blank column C is never overwritten |
| Dry-run | Yes — \`--preview\` (preferred) or \`--dry-run\` |
| Safe locally | Dry-run is safe; live write only appends/fills blanks for **explicit** keys |
| Bulk translation UPDATE | **Not available** — use CSV + manual Sheet edit, then \`export:i18n\` |

Required env (under \`packages/i18n-export/\`, never commit secrets):

- \`GOOGLE_SHEETS_SPREADSHEET_ID\`
- \`GOOGLE_SHEETS_CREDENTIALS_PATH\` (default \`./credentials.json\`)
- \`GOOGLE_SHEETS_TOKEN_PATH\` (default \`./token.json\`)

Spreadsheet / document identifiers are treated as secret — not printed here.

**Decision for Phase 35D2:** do **not** execute live Sheet writes. Export corrections via CSV below. Use dry-run only if verifying key-row sync for ADD keys.

## 3. Missing keys (code → catalog)

${
  missingKeys.length === 0
    ? '_None found_ in non-test \`t()\` / \`translate()\` calls.'
    : missingKeys
        .map(m => `- \`${m.key}\` — \`${m.file}\``)
        .join('\n')
}

Proposed ADD keys (hard-coded gaps, not yet wired in code):

${proposedAdditions.map(a => `- \`${a.key}\` — ${a.notes}`).join('\n')}

## 4. Placeholder mismatches

${
  placeholderMismatches.length === 0
    ? '_None_ — placeholder token multisets match across nl/en/es/zh for every key.'
    : placeholderMismatches.map(p => `- \`${p.key}\`: ${JSON.stringify(p)}`).join('\n')
}

## 5. Hard-coded visible strings (audited feature paths)

Allowlisted / tracked findings: **${hardcoded.filter(h => h.allowlisted).length}**  
Non-allowlisted candidates: **${hardcoded.filter(h => !h.allowlisted).length}**

### Priority findings (manual)

1. Admin operations feed renders API \`event.message\` (Dutch + raw status enums) — \`ViewAdminDashboard.vue\`, \`ViewAdminOrders.vue\`.
2. Notification fallbacks \`'A pharmacy'\` / \`'Notification'\` in \`notification-display.ts\` (ADD keys proposed).
3. Duration units \`h\`/\`m\`/\`s\` in \`formatHandlingDuration\` (ADD keys proposed).
4. File-size units \`B\`/\`KiB\`/\`MiB\` in voice recorder types (ADD keys proposed).
5. Static NL shell: \`index.html\` title/description; PWA manifest \`lang: 'nl'\`; offline brand name.

Sample rows:

${hardcoded
  .slice(0, 25)
  .map(
    h =>
      `- \`${h.file}:${h.line}\`${h.allowlisted ? ' _(allowlisted)_' : ''}: \`${h.text.replace(/`/g, "'")}\``,
  )
  .join('\n') || '_No heuristic hits._'}

## 6. Untranslated or suspicious values

Key counts: ${LOCALES.map(l => `${l}=${keyCounts[l]}`).join(', ')}

| Locale | Values identical to EN (≥6 chars) |
|--------|-----------------------------------|
| nl | ${sameAsEn.nl} |
| es | ${sameAsEn.es} |
| zh | ${sameAsEn.zh} |

Most \`es\`/\`zh\` catalog entries still mirror English Default. Treat as **REVIEW** in the CSV (do not auto-rewrite style of already-localised NL).

NL clones excluding allowlist: see CSV \`REVIEW\` rows with \`nl=en\`.

## 7. Stale / unused keys

Count: **${unusedKeys.length}** (heuristic harvest — may include dynamic-only keys).

Do **not** delete in this phase unless clearly dangerous duplicates. Listed as \`UNUSED\` in the CSV.

## 8. Terminology consistency

${terminology.map(t => `- ${t}`).join('\n')}

Keep: order / delivery / route / stop / doses / history / notifications / voice report / transcription aligned with existing NL product language (\`bestelling\`, \`levering\`, \`route\`, \`stop\`, \`dosissen\`, \`geschiedenis\`, \`meldingen\`, \`spraakrapport\`, \`transcriptie\`).

## 9. Files changed / generated (this phase)

See git status after the agent run. Expected deliverables:

- \`docs/i18n-audit.md\` (this file)
- \`artifacts/i18n-sheet-import.csv\`
- \`artifacts/i18n-audit-summary.json\`
- \`packages/pwa/scripts/phase35d2-i18n-audit.mjs\`
- validation specs under \`packages/pwa/src/i18n/\`

## 10. Generated audit / export files

- CSV: \`${path.relative(REPO_ROOT, csvPath).replaceAll('\\\\', '/')}\`
- Columns: \`key,nl,en,es,zh,status,source,notes\`
- Statuses: \`ADD\`, \`READY_FOR_SHEET\`, \`UPDATE\`, \`REVIEW\`, \`UNUSED\`

### Mapping CSV → Google Sheet tabs

Each locale tab expects: \`Key | Default | {locale}\`.

For each CSV \`READY_FOR_SHEET\` / \`ADD\` row:

1. On tab \`en\`: Key=\`key\`, Default=\`en\`, en=\`en\`
2. On tab \`nl\`: Key=\`key\`, Default=\`en\`, nl=\`nl\`
3. On tab \`es\`: Key=\`key\`, Default=\`en\`, es=\`es\`
4. On tab \`zh\`: Key=\`key\`, Default=\`en\`, zh=\`zh\`

Prefer Default = English. Then run \`npm run export:i18n\`.

**Phase 35D3:** runtime catalogs already contain these keys (\`READY_FOR_SHEET\`). Sheet import remains manual so the spreadsheet stays the long-term source of truth.

**Manual workflow:**

1. Import or copy \`READY_FOR_SHEET\` / \`ADD\` rows into the Sheet;
2. Preserve \`Key | Default | locale\` structure;
3. Run \`npm run export:i18n\`;
4. Run \`npm run audit:i18n\`;
5. Review the diff before commit.

## 11. Exact safe commands

\`\`\`bash
# Localisation audit + CSV (no Google)
npm run audit:i18n --workspace=@vaccin-delivery/pwa

# Existing offline parity / soft Dutch audit
npm run test --workspace=@vaccin-delivery/pwa -- src/i18n
npm run audit:hardcoded-strings --workspace=@vaccin-delivery/pwa

# Sheets → repo (READ only; needs local OAuth)
npm run export:i18n

# Repo → Sheet key rows DRY-RUN only (safe; no writes)
npm run sync:i18n:keys -- --preview "example.key=Example default"

# LIVE key sync — DO NOT RUN in Phase 35D2 without explicit approval
# npm run sync:i18n:keys -- "example.key=Example default" --en "..." --nl "..." --es "..." --zh "..."
\`\`\`

After humans paste CSV ADD/UPDATE rows into the Sheet locale tabs (\`Key | Default | {locale}\`):

\`\`\`bash
npm run export:i18n
\`\`\`

## 12–14. Tests, builds, manual Sheet actions

- Run PWA i18n Vitest suite and \`test:i18n\` exporter package tests.
- Manual Sheet: import/review CSV \`ADD\` + prioritise \`REVIEW\` for recent domains (\`admin.courierAnalytics.*\`, \`routeVoiceReports.*\`, \`notifications.*\`, history).
- Do **not** deploy as part of this phase.
`
}

function mergeProposedAdditions(missing) {
  const byKey = new Map(BASE_PROPOSED_ADDITIONS.map(row => [row.key, row]))
  for (const item of missing) {
    if (byKey.has(item.key)) continue
    byKey.set(item.key, {
      key: item.key,
      nl: '',
      en: '',
      es: '',
      zh: '',
      source: item.file,
      notes:
        'Used in code but missing from catalogs — provide translations before Sheet import',
    })
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key))
}

function main() {
  const catalogs = loadCatalogs()
  const keyCounts = Object.fromEntries(
    LOCALES.map(l => [l, Object.keys(catalogs[l]).length]),
  )

  const nlKeys = Object.keys(catalogs.nl).sort()
  for (const locale of LOCALES) {
    const keys = Object.keys(catalogs[locale]).sort()
    if (JSON.stringify(keys) !== JSON.stringify(nlKeys)) {
      throw new Error(`Key set parity failed for ${locale}`)
    }
  }

  const placeholderMismatches = []
  for (const key of nlKeys) {
    const expected = placeholderMultiset(catalogs.nl[key])
    for (const locale of LOCALES) {
      const actual = placeholderMultiset(catalogs[locale][key])
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        placeholderMismatches.push({
          key,
          locale,
          expected,
          actual,
          nl: catalogs.nl[key],
          value: catalogs[locale][key],
        })
      }
    }
  }

  const files = walkSourceFiles(SRC_ROOT)
  const { used, missing, catalogKeys } = collectKeyUsages(files)
  const unusedKeys = new Set(
    [...catalogKeys].filter(k => !used.has(k)).sort(),
  )

  const sameAsEn = { nl: 0, es: 0, zh: 0 }
  for (const key of catalogKeys) {
    const en = catalogs.en[key]
    if (!en || en.length < 6) continue
    for (const locale of ['nl', 'es', 'zh']) {
      if (catalogs[locale][key] === en) sameAsEn[locale] += 1
    }
  }

  const proposedAdditions = mergeProposedAdditions(missing)
  const hardcoded = scanHardcodedCandidates(files)
  const { header, rows } = buildCsvRows(
    catalogs,
    unusedKeys,
    proposedAdditions,
  )

  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true })
  fs.mkdirSync(DOCS_DIR, { recursive: true })

  const csvPath = path.join(ARTIFACTS_DIR, 'i18n-sheet-import.csv')
  writeCsv(csvPath, header, rows)

  const uniqueMissingKeys = [...new Set(missing.map(m => m.key))].sort()

  const summary = {
    generatedBy: 'phase35d2-i18n-audit.mjs',
    locales: LOCALES,
    keyCounts,
    placeholderMismatchCount: placeholderMismatches.length,
    missingKeyCount: uniqueMissingKeys.length,
    missingKeys: uniqueMissingKeys,
    unusedKeyCount: unusedKeys.size,
    sameAsEn,
    proposedAdditionCount: proposedAdditions.length,
    csvRowCount: rows.length,
    csvStatusCounts: rows.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1
      return acc
    }, {}),
    hardcodedCandidateCount: hardcoded.length,
    hardcodedAllowlistedCount: hardcoded.filter(h => h.allowlisted).length,
    sheetsCapability: {
      read: true,
      writeKeysOnly: true,
      writeFullCatalog: false,
      dryRun: true,
      overwritesHumanTranslations: false,
    },
  }

  const summaryPath = path.join(ARTIFACTS_DIR, 'i18n-audit-summary.json')
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

  const md = buildMarkdown({
    keyCounts,
    placeholderMismatches,
    missingKeys: missing,
    unusedKeys: [...unusedKeys],
    sameAsEn,
    csvPath,
    hardcoded,
    sheetsCapability: summary.sheetsCapability,
    proposedAdditions,
    terminology: terminologyNotes(catalogs),
  })
  const mdPath = path.join(DOCS_DIR, 'i18n-audit.md')
  fs.writeFileSync(mdPath, md, 'utf8')

  console.log('Phase 35D2 i18n audit complete')
  console.log(JSON.stringify(summary, null, 2))
  console.log(`Wrote ${path.relative(REPO_ROOT, csvPath)}`)
  console.log(`Wrote ${path.relative(REPO_ROOT, mdPath)}`)
  console.log(`Wrote ${path.relative(REPO_ROOT, summaryPath)}`)
}

main()
