#!/usr/bin/env node
/**
 * Phase 35D2 / 35D4 / 35D5 — deterministic localisation audit + report export.
 *
 * Tracked audit *snapshots* (manual reporting only; not required for normal development):
 *   - docs/i18n-audit.md
 *   - artifacts/i18n-sheet-import.csv
 *   - artifacts/i18n-audit-summary.json
 *
 * Does NOT call Google Sheets. Does NOT mutate locale JSON.
 *
 * Modes:
 *   --check   Validate runtime catalogues + source in memory. Never write.
 *             Never compare to / require freshness of tracked audit snapshots.
 *             Exit 1 on localisation failures only.
 *   --update  Rewrite the three tracked audit artefacts when content differs
 *             (idempotent). Manual reporting command — not a normal workflow step.
 *
 * Optional: --out-dir <path>  Write artefacts under a directory (update / tests).
 *           Ignored by --check (check never reads or writes artefact files).
 *
 * Default with no mode flag: --check (safe; does not modify the working tree).
 *
 * Usage:
 *   npm run audit:i18n:check
 *   npm run audit:i18n:update
 *   npm run audit:i18n   # alias of check
 *
 * Test-only helpers live in phase35d2-i18n-audit-helpers.mjs:
 *   validateLocalisation, compareSnapshots (not used by --check)
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  CSV_REPO_PATH,
  SUMMARY_REPO_PATH,
  MD_REPO_PATH,
  normalizeNewlines,
  finalizeContent,
  resolveArtefactPaths,
  validateLocalisation,
} from './phase35d2-i18n-audit-helpers.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const PWA_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(PWA_ROOT, '../..')
const SRC_ROOT = path.join(PWA_ROOT, 'src')
const LOCALES_DIR = path.join(SRC_ROOT, 'locales')

/** Optional Prettier (repo root) — keeps JSON/MD aligned with project formatting. */
async function formatWithPrettier(source, filepath) {
  try {
    const prettier = require(
      path.join(REPO_ROOT, 'node_modules/prettier/index.cjs'),
    )
    const config = (await prettier.resolveConfig(filepath)) ?? {}
    return await prettier.format(source, {
      ...config,
      filepath,
    })
  } catch {
    return source
  }
}

const LOCALES = ['nl', 'en', 'es', 'zh']
const PLACEHOLDER_RE = /\{[^}]+\}/g

/** Tracked artefact paths imported from helpers (repo-relative, POSIX). */

/** Directories skipped while walking source (never audit generated/ephemeral trees). */
const SKIP_DIR_NAMES = new Set([
  'locales',
  'node_modules',
  'dist',
  'coverage',
  '__snapshots__',
  '__generated__',
  'generated',
  '.git',
  '.turbo',
  '.vite',
  'tmp',
  'temp',
  'test-results',
  'playwright-report',
])

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

/**
 * Status / enum display keys that must exist in every locale catalogue
 * (mirrors packages/pwa/src/i18n/status-enum-mapping.spec.ts).
 */
const STATUS_ENUM_REQUIRED_KEYS = [
  'status.order.pending',
  'status.order.planned',
  'status.order.delivered',
  'status.order.cancelled',
  'status.route.assigned',
  'status.route.inProgress',
  'status.route.completed',
  'status.route.cancelled',
  'status.role.admin',
  'status.role.apotheker',
  'status.role.bezorger',
  'status.operations.newOrder',
  'status.operations.orderStatusChanged',
  'status.operations.lowStock',
  'status.active',
  'status.inactive',
  'status.notification.read',
  'status.notification.unread',
  'orderHistory.deliveryMethod.admin',
  'orderHistory.deliveryMethod.qr',
  'admin.stock.adjustment.restock',
  'admin.stock.adjustment.decrease',
  'admin.stock.adjustment.correction',
  'admin.stock.adjustment.deliveryDeduction',
  'common.unknown',
  'notifications.fallback.title',
  'notifications.fallback.body',
]

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

/** Normalise any path segment to repo-relative POSIX form. */
function toPosix(value) {
  return String(value).replaceAll('\\', '/')
}

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
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))

  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry.name)) {
      continue
    }
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkSourceFiles(full, out)
      continue
    }
    if (!/\.(vue|ts|tsx|js|mjs)$/.test(entry.name)) continue
    if (entry.name.endsWith('.d.ts')) continue
    // Exclude vitest/playwright coverage and generated GraphQL artefacts by name.
    if (/\.(spec|test)\.[jt]sx?$/.test(entry.name)) {
      // Still collect for key harvest via isTestFile filter later; keep walking.
    }
    out.push(full)
  }
  return out
}

function relSrc(file) {
  return toPosix(path.relative(SRC_ROOT, file))
}

function isTestFile(rel) {
  return (
    /\.(spec|test)\.[jt]sx?$/.test(rel) ||
    rel.endsWith('test-utils.ts') ||
    rel.includes('/__tests__/') ||
    rel.includes('/__mocks__/')
  )
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
  const catalogKeys = new Set(Object.keys(catalogs.en).sort())
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
      for (const site of [...sites].sort()) {
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
      source: toPosix(add.source),
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

/**
 * Write UTF-8 LF content only when it differs from the on-disk normalised file.
 * Returns true when a write occurred.
 */
function writeIfChanged(filePath, content) {
  const next = normalizeNewlines(content)
  const finalContent = next.endsWith('\n') ? next : `${next}\n`

  if (fs.existsSync(filePath)) {
    const prev = normalizeNewlines(fs.readFileSync(filePath, 'utf8'))
    if (prev === finalContent) {
      return false
    }
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, finalContent, { encoding: 'utf8' })
  return true
}

/** Write BOM-less UTF-8 so spreadsheet tools keep Chinese/Spanish characters. */
function renderCsv(header, rows) {
  const lines = [
    header.join(','),
    ...rows.map(row => header.map(col => csvEscape(row[col])).join(',')),
  ]
  return `${lines.join('\n')}\n`
}

function scanHardcodedCandidates(files) {
  const findings = []
  for (const file of files) {
    const rel = relSrc(file)
    if (isTestFile(rel)) continue
    const inScope = HARDCODED_AUDIT_GLOBS.some(
      g =>
        rel === g ||
        rel.startsWith(`${toPosix(g)}/`) ||
        rel.startsWith(toPosix(g)),
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

  findings.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.text.localeCompare(b.text),
  )
  return findings
}

function terminologyNotes(catalogs) {
  const notes = []
  const samples = [
    {
      term: 'courier / bezorger',
      keys: Object.keys(catalogs.en)
        .filter(
          k =>
            /courier|bezorger/i.test(k) ||
            /courier|bezorger/i.test(catalogs.en[k]),
        )
        .sort(),
    },
    {
      term: 'pharmacist / apotheker',
      keys: Object.keys(catalogs.en)
        .filter(
          k =>
            /pharmacist|apotheker|pharmacy/i.test(k) ||
            /pharmacist|apotheker|pharmacy/i.test(catalogs.en[k]),
        )
        .sort(),
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
    hardcoded,
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

- CSV: \`${CSV_REPO_PATH}\`
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

**Manual Sheet workflow (normal translation change):**

1. Update the Google Sheet;
2. Run \`npm run export:i18n\` (writes locale JSON only — never audit snapshots);
3. Use the generated key in code via \`t()\` / \`translate()\` / status-labels helpers;
4. Run \`npm run audit:i18n:check\` (in-memory localisation validation; never writes);
5. Commit source + locale catalogues.

**Audit report refresh (manual only — not required after every change):**

1. Run \`npm run audit:i18n:update\`;
2. Review \`docs/i18n-audit.md\`, \`artifacts/i18n-audit-summary.json\`, \`artifacts/i18n-sheet-import.csv\`;
3. Commit those three files only when an updated audit snapshot is intentionally required.

### Artefact check vs update

| Command | Writes tracked snapshots? | Purpose |
|---------|---------------------------|---------|
| \`audit:i18n:check\` (default) | **Never** | Validate catalogues + UI keys in memory; safe for tests, pre-commit, CI |
| \`audit:i18n:update\` | Yes (MD / JSON / CSV) | Manual report refresh only |
| \`export:i18n\` | **Never** (locales only) | Sheet → runtime catalogues |

Check mode does **not** fail merely because committed audit snapshots are older than the current catalogues. Snapshot freshness is never enforced by tests, hooks, or CI.

For ordinary development: run \`npm run audit:i18n:check\` — no files are modified.

## 11. Exact safe commands

\`\`\`bash
# Validate localisation (no writes; does not require snapshot freshness)
npm run audit:i18n:check
# alias:
npm run audit:i18n

# Explicitly rewrite tracked audit report snapshots (manual reporting only)
npm run audit:i18n:update

# Existing offline parity / soft Dutch audit
npm run test --workspace=@vaccin-delivery/pwa -- src/i18n
npm run audit:hardcoded-strings --workspace=@vaccin-delivery/pwa

# Sheets → repo (READ only; needs local OAuth; writes locale JSON only)
npm run export:i18n

# Repo → Sheet key rows DRY-RUN only (safe; no writes)
npm run sync:i18n:keys -- --preview "example.key=Example default"

# LIVE key sync — DO NOT RUN without explicit approval
# npm run sync:i18n:keys -- "example.key=Example default" --en "..." --nl "..." --es "..." --zh "..."
\`\`\`

After humans paste CSV ADD/UPDATE rows into the Sheet locale tabs (\`Key | Default | {locale}\`):

\`\`\`bash
npm run export:i18n
npm run audit:i18n:check
# optional report refresh:
# npm run audit:i18n:update
\`\`\`

## 12–14. Tests, builds, manual Sheet actions

- Run PWA i18n Vitest suite and \`test:i18n\` exporter package tests (audit tests use check / temp dirs only).
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
      source: toPosix(item.file),
      notes:
        'Used in code but missing from catalogs — provide translations before Sheet import',
    })
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key))
}

function stableStatusCounts(rows) {
  const order = ['ADD', 'READY_FOR_SHEET', 'UPDATE', 'REVIEW', 'UNUSED']
  const counts = {}
  for (const row of rows) {
    counts[row.status] = (counts[row.status] || 0) + 1
  }
  const ordered = {}
  for (const status of order) {
    if (counts[status] != null) {
      ordered[status] = counts[status]
    }
  }
  for (const status of Object.keys(counts).sort()) {
    if (ordered[status] == null) {
      ordered[status] = counts[status]
    }
  }
  return ordered
}

/**
 * Deterministic scan of locale catalogues + PWA source (no disk artefact I/O).
 * @returns {Promise<object>}
 */
async function runAuditScan() {
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
  placeholderMismatches.sort(
    (a, b) => a.key.localeCompare(b.key) || a.locale.localeCompare(b.locale),
  )

  const files = walkSourceFiles(SRC_ROOT).sort((a, b) =>
    relSrc(a).localeCompare(relSrc(b)),
  )
  const { used, missing, catalogKeys } = collectKeyUsages(files)
  const unusedKeys = new Set(
    [...catalogKeys].filter(k => !used.has(k)).sort(),
  )

  const sameAsEn = { nl: 0, es: 0, zh: 0 }
  for (const key of [...catalogKeys].sort()) {
    const en = catalogs.en[key]
    if (!en || en.length < 6) continue
    for (const locale of ['nl', 'es', 'zh']) {
      if (catalogs[locale][key] === en) sameAsEn[locale] += 1
    }
  }

  const proposedAdditions = mergeProposedAdditions(missing)
  const hardcoded = scanHardcodedCandidates(files)
  const hardcodedNonAllowlisted = hardcoded.filter(h => !h.allowlisted)
  const { header, rows } = buildCsvRows(
    catalogs,
    unusedKeys,
    proposedAdditions,
  )

  const uniqueMissingKeys = [...new Set(missing.map(m => m.key))].sort()

  const statusEnumKeysMissing = STATUS_ENUM_REQUIRED_KEYS.filter(key => {
    for (const locale of LOCALES) {
      const value = catalogs[locale][key]
      if (value == null || String(value).trim() === '') {
        return true
      }
    }
    return false
  })

  // Known raw-key rendering risk: UI calls a key that is absent from catalogues.
  const rawKeyRisks = uniqueMissingKeys.map(key => ({
    key,
    reason: 'Used in UI but missing from runtime catalogues (would render as raw key)',
  }))

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
    csvStatusCounts: stableStatusCounts(rows),
    hardcodedCandidateCount: hardcoded.length,
    hardcodedAllowlistedCount: hardcoded.filter(h => h.allowlisted).length,
    statusEnumKeysMissingCount: statusEnumKeysMissing.length,
    sheetsCapability: {
      read: true,
      writeKeysOnly: true,
      writeFullCatalog: false,
      dryRun: true,
      overwritesHumanTranslations: false,
    },
  }

  return {
    catalogs,
    keyCounts,
    placeholderMismatches,
    missing,
    uniqueMissingKeys,
    unusedKeys,
    sameAsEn,
    proposedAdditions,
    hardcoded,
    hardcodedNonAllowlisted,
    statusEnumKeysMissing,
    rawKeyRisks,
    header,
    rows,
    summary,
    terminology: terminologyNotes(catalogs),
  }
}

/**
 * @returns {{ csv: string, summaryJson: string, md: string, summary: object, scan: object }}
 */
async function generateArtefactContents() {
  const scan = await runAuditScan()

  const csv = finalizeContent(renderCsv(scan.header, scan.rows))

  const summaryPathForPrettier = path.join(
    REPO_ROOT,
    ...SUMMARY_REPO_PATH.split('/'),
  )
  const summaryJson = finalizeContent(
    await formatWithPrettier(
      `${JSON.stringify(scan.summary, null, 2)}\n`,
      summaryPathForPrettier,
    ),
  )

  const mdRaw = buildMarkdown({
    keyCounts: scan.keyCounts,
    placeholderMismatches: scan.placeholderMismatches,
    missingKeys: scan.missing,
    unusedKeys: [...scan.unusedKeys].sort(),
    sameAsEn: scan.sameAsEn,
    hardcoded: scan.hardcoded,
    proposedAdditions: scan.proposedAdditions,
    terminology: scan.terminology,
  })
  const mdPathForPrettier = path.join(REPO_ROOT, ...MD_REPO_PATH.split('/'))
  const md = finalizeContent(
    await formatWithPrettier(mdRaw, mdPathForPrettier),
  )

  return { csv, summaryJson, md, summary: scan.summary, scan }
}

function parseCliArgs(argv) {
  let mode = 'check'
  let outDir = null
  const args = argv.slice(2)
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--check') {
      mode = 'check'
      continue
    }
    if (arg === '--update') {
      mode = 'update'
      continue
    }
    if (arg === '--out-dir') {
      outDir = args[i + 1]
      if (!outDir || outDir.startsWith('--')) {
        throw new Error('--out-dir requires a path argument')
      }
      i += 1
      continue
    }
    if (arg === '--help' || arg === '-h') {
      mode = 'help'
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return { mode, outDir }
}

/**
 * Validate localisation health in memory. Never reads or writes audit snapshots.
 */
async function runCheck() {
  const scan = await runAuditScan()
  const failures = validateLocalisation(scan)

  console.log('Phase 35D2 i18n audit check')
  console.log(JSON.stringify(scan.summary, null, 2))
  console.log(
    'Validated localisation in memory (tracked audit snapshots not compared)',
  )

  if (failures.length > 0) {
    console.error('i18n localisation check failed:')
    for (const line of failures) {
      console.error(`  - ${line}`)
    }
    process.exitCode = 1
    return
  }

  console.log('Localisation check passed')
  console.log(
    `Key parity OK (${LOCALES.map(l => `${l}=${scan.keyCounts[l]}`).join(', ')})`,
  )
  console.log('Placeholder parity OK')
  console.log('No missing UI keys / raw-key risks')
  console.log('No confirmed hard-coded visible text in audited paths')
  console.log('Status/enum mapping keys present')
}

async function runUpdate(paths, contents) {
  fs.mkdirSync(path.dirname(paths.csv), { recursive: true })
  fs.mkdirSync(path.dirname(paths.summary), { recursive: true })
  fs.mkdirSync(path.dirname(paths.md), { recursive: true })

  const csvWritten = writeIfChanged(paths.csv, contents.csv)
  const summaryWritten = writeIfChanged(paths.summary, contents.summaryJson)
  const mdWritten = writeIfChanged(paths.md, contents.md)

  console.log('Phase 35D2 i18n audit update')
  console.log(JSON.stringify(contents.summary, null, 2))
  console.log(`${csvWritten ? 'Wrote' : 'Unchanged'} ${CSV_REPO_PATH}`)
  console.log(`${mdWritten ? 'Wrote' : 'Unchanged'} ${MD_REPO_PATH}`)
  console.log(
    `${summaryWritten ? 'Wrote' : 'Unchanged'} ${SUMMARY_REPO_PATH}`,
  )

  if (!csvWritten && !summaryWritten && !mdWritten) {
    console.log('All i18n audit artefacts already up to date')
  }
}

async function main() {
  const { mode, outDir } = parseCliArgs(process.argv)
  if (mode === 'help') {
    console.log(`Usage:
  node phase35d2-i18n-audit.mjs --check
  node phase35d2-i18n-audit.mjs --update [--out-dir <dir>]

--check   Validate localisation in memory; never write; ignore snapshot freshness (default)
--update  Rewrite audit report artefacts when content differs
--out-dir Optional directory for artefact write (update / tests only; ignored by --check)`)
    return
  }

  if (mode === 'check') {
    if (outDir) {
      console.log(
        'Note: --out-dir is ignored in --check (check never reads or writes artefacts)',
      )
    }
    await runCheck()
    return
  }

  if (mode === 'update') {
    const paths = resolveArtefactPaths(outDir)
    const contents = await generateArtefactContents()
    await runUpdate(paths, contents)
    return
  }

  throw new Error(`Unsupported mode: ${mode}`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
