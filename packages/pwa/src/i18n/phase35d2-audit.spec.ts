/**
 * Phase 35D2 / 35D5 — deterministic i18n audit (check vs update).
 *
 * Check validates localisation in memory and must never rewrite tracked
 * audit snapshots or require their freshness.
 *
 * Snapshot comparison is tested only via helpers + temp dirs (not --check).
 *
 * @vitest-environment node
 */
import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

const pwaRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const repoRoot = path.resolve(pwaRoot, '../..')
const script = path.join(pwaRoot, 'scripts/phase35d2-i18n-audit.mjs')
const helpers = path.join(pwaRoot, 'scripts/phase35d2-i18n-audit-helpers.mjs')
const trackedCsv = path.join(repoRoot, 'artifacts/i18n-sheet-import.csv')
const trackedSummary = path.join(repoRoot, 'artifacts/i18n-audit-summary.json')
const trackedMd = path.join(repoRoot, 'docs/i18n-audit.md')

const EXPECTED_HEADER = 'key,nl,en,es,zh,status,source,notes'

const tempDirs: string[] = []

function hashFile(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function snapshotTracked(): { csv: string; summary: string; md: string } {
  return {
    csv: hashFile(trackedCsv),
    summary: hashFile(trackedSummary),
    md: hashFile(trackedMd),
  }
}

function makeTempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-audit-'))
  tempDirs.push(dir)
  return dir
}

function runAudit(args: string[], options?: { expectError?: boolean }) {
  try {
    const stdout = execFileSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      cwd: pwaRoot,
    })
    return { stdout, status: 0 }
  } catch (error) {
    const err = error as {
      status?: number
      stdout?: string
      stderr?: string
    }
    if (options?.expectError) {
      return {
        stdout: String(err.stdout ?? ''),
        stderr: String(err.stderr ?? ''),
        status: err.status ?? 1,
      }
    }
    throw error
  }
}

/** Run a small ESM snippet that imports audit helpers (keeps vue-tsc off .mjs). */
function runHelpersEval(source: string): string {
  const helpersUrl = pathToFileURL(helpers).href
  const wrapped = `import {
  compareSnapshots,
  resolveArtefactPaths,
  validateLocalisation,
} from ${JSON.stringify(helpersUrl)};
${source}`
  return execFileSync(process.execPath, ['--input-type=module', '-e', wrapped], {
    encoding: 'utf8',
    cwd: pwaRoot,
  })
}

function parseCsvStatusColumn(line: string): string {
  const cols: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === ',' && !inQuotes) {
      cols.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  cols.push(cur)
  return cols[5] ?? ''
}

function readOutArtefacts(outRoot: string) {
  return {
    csv: fs.readFileSync(
      path.join(outRoot, 'artifacts/i18n-sheet-import.csv'),
      'utf8',
    ),
    summary: fs.readFileSync(
      path.join(outRoot, 'artifacts/i18n-audit-summary.json'),
      'utf8',
    ),
    md: fs.readFileSync(path.join(outRoot, 'docs/i18n-audit.md'), 'utf8'),
  }
}

describe('phase35d2 i18n audit', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  it('check mode leaves tracked artefacts unchanged and is deterministic', () => {
    const before = snapshotTracked()

    const first = runAudit(['--check'])
    const mid = snapshotTracked()
    const second = runAudit(['--check'])
    const after = snapshotTracked()

    expect(first.status).toBe(0)
    expect(second.status).toBe(0)
    expect(first.stdout).toContain('Phase 35D2 i18n audit check')
    expect(first.stdout).toContain('Localisation check passed')
    expect(second.stdout).toContain('Localisation check passed')
    expect(first.stdout).toContain(
      'Validated localisation in memory (tracked audit snapshots not compared)',
    )
    expect(first.stdout).not.toContain('Stale i18n audit artefacts')
    expect(mid).toEqual(before)
    expect(after).toEqual(before)
  })

  it('default CLI mode is check (no writes)', () => {
    const before = snapshotTracked()
    const result = runAudit([])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Phase 35D2 i18n audit check')
    expect(result.stdout).toContain('Localisation check passed')
    expect(snapshotTracked()).toEqual(before)
  })

  it('check mode does not fail when tracked audit snapshots are stale', () => {
    const before = snapshotTracked()
    const outRoot = makeTempRoot()
    fs.mkdirSync(path.join(outRoot, 'artifacts'), { recursive: true })
    fs.mkdirSync(path.join(outRoot, 'docs'), { recursive: true })
    fs.writeFileSync(
      path.join(outRoot, 'artifacts/i18n-sheet-import.csv'),
      'stale-csv\n',
      'utf8',
    )
    fs.writeFileSync(
      path.join(outRoot, 'artifacts/i18n-audit-summary.json'),
      '{}\n',
      'utf8',
    )
    fs.writeFileSync(
      path.join(outRoot, 'docs/i18n-audit.md'),
      '# stale\n',
      'utf8',
    )

    const result = runAudit(['--check', '--out-dir', outRoot])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Localisation check passed')
    expect(result.stdout).toContain('--out-dir is ignored in --check')
    expect(result.stdout).not.toContain('Stale i18n audit artefacts')
    expect(
      fs.readFileSync(
        path.join(outRoot, 'artifacts/i18n-sheet-import.csv'),
        'utf8',
      ),
    ).toBe('stale-csv\n')
    expect(snapshotTracked()).toEqual(before)
  })

  it('update mode writes deterministic LF POSIX artefacts into a temp directory', () => {
    const before = snapshotTracked()
    const outRoot = makeTempRoot()

    const first = runAudit(['--update', '--out-dir', outRoot])
    const second = runAudit(['--update', '--out-dir', outRoot])
    const artefacts = readOutArtefacts(outRoot)

    expect(first.status).toBe(0)
    expect(second.status).toBe(0)
    expect(first.stdout).toContain('Phase 35D2 i18n audit update')
    expect(first.stdout).toMatch(/Wrote artifacts\/i18n-sheet-import\.csv/)
    expect(second.stdout).toContain('Unchanged artifacts/i18n-sheet-import.csv')
    expect(second.stdout).toContain('Unchanged docs/i18n-audit.md')
    expect(second.stdout).toContain(
      'Unchanged artifacts/i18n-audit-summary.json',
    )
    expect(second.stdout).toContain('All i18n audit artefacts already up to date')

    expect(artefacts.csv.includes('\r')).toBe(false)
    expect(artefacts.summary.includes('\r')).toBe(false)
    expect(artefacts.md.includes('\r')).toBe(false)
    expect(artefacts.md).toContain('artifacts/i18n-sheet-import.csv')
    expect(artefacts.md).not.toContain('artifacts\\i18n-sheet-import.csv')
    expect(artefacts.md).not.toMatch(/[A-Za-z]:\\/)
    expect(artefacts.csv.startsWith(`${EXPECTED_HEADER}\n`)).toBe(true)

    const statuses = new Set(
      artefacts.csv.trim().split('\n').slice(1).map(parseCsvStatusColumn),
    )
    for (const status of statuses) {
      expect([
        'ADD',
        'READY_FOR_SHEET',
        'UPDATE',
        'REVIEW',
        'UNUSED',
      ]).toContain(status)
    }

    const summary = JSON.parse(artefacts.summary) as {
      keyCounts: Record<string, number>
      placeholderMismatchCount: number
      missingKeyCount: number
      missingKeys: string[]
      statusEnumKeysMissingCount: number
      sheetsCapability: {
        writeFullCatalog: boolean
        overwritesHumanTranslations: boolean
        dryRun: boolean
      }
      csvStatusCounts: Record<string, number>
    }

    expect(summary.keyCounts.nl).toBe(summary.keyCounts.en)
    expect(summary.keyCounts.en).toBe(summary.keyCounts.es)
    expect(summary.keyCounts.es).toBe(summary.keyCounts.zh)
    expect(summary.placeholderMismatchCount).toBe(0)
    expect(summary.statusEnumKeysMissingCount).toBe(0)
    expect(summary.sheetsCapability.writeFullCatalog).toBe(false)
    expect(summary.sheetsCapability.overwritesHumanTranslations).toBe(false)
    expect(summary.sheetsCapability.dryRun).toBe(true)
    expect(summary.csvStatusCounts.READY_FOR_SHEET).toBeGreaterThan(0)
    expect(summary.csvStatusCounts.REVIEW).toBeGreaterThan(0)
    expect(Object.keys(summary.csvStatusCounts)).toEqual([
      'READY_FOR_SHEET',
      'REVIEW',
      'UNUSED',
    ])
    expect(artefacts.csv).toContain('arrival.markArrived')
    expect(artefacts.csv).toContain('deliveryManifest.downloadRoute')
    expect(summary.missingKeys).not.toContain('arrival.markArrived')
    expect(summary.missingKeyCount).toBe(0)
    expect(artefacts.md).toContain('Phase 35D2')
    expect(artefacts.md).toContain('audit:i18n:update')
    expect(artefacts.md).toContain('audit:i18n:check')
    expect(artefacts.md).toContain(
      'does **not** fail merely because committed audit snapshots are older',
    )
    expect(artefacts.md).not.toMatch(/AIza|private_key|BEGIN PRIVATE KEY/)
    expect(Object.prototype.hasOwnProperty.call(summary, 'generatedAt')).toBe(
      false,
    )

    expect(snapshotTracked()).toEqual(before)
  })

  it('compareSnapshots helper detects stale temp artefacts (not used by --check)', () => {
    const before = snapshotTracked()
    const outRoot = makeTempRoot()
    fs.mkdirSync(path.join(outRoot, 'artifacts'), { recursive: true })
    fs.mkdirSync(path.join(outRoot, 'docs'), { recursive: true })
    fs.writeFileSync(
      path.join(outRoot, 'artifacts/i18n-sheet-import.csv'),
      'stale\n',
      'utf8',
    )
    fs.writeFileSync(
      path.join(outRoot, 'artifacts/i18n-audit-summary.json'),
      '{}\n',
      'utf8',
    )
    fs.writeFileSync(path.join(outRoot, 'docs/i18n-audit.md'), '# stale\n', 'utf8')

    const outRootJson = JSON.stringify(outRoot)
    const stdout = runHelpersEval(`
      const paths = resolveArtefactPaths(${outRootJson})
      const stale = compareSnapshots(paths, {
        csv: 'expected-csv\\n',
        summaryJson: '{"ok":true}\\n',
        md: '# expected\\n',
      })
      process.stdout.write(JSON.stringify(stale))
    `)
    const stale = JSON.parse(stdout) as string[]
    expect(stale).toEqual(
      expect.arrayContaining([
        'artifacts/i18n-sheet-import.csv',
        'artifacts/i18n-audit-summary.json',
        'docs/i18n-audit.md',
      ]),
    )

    const check = runAudit(['--check'])
    expect(check.status).toBe(0)
    expect(check.stdout).not.toContain('Stale i18n audit artefacts')
    expect(snapshotTracked()).toEqual(before)
  })

  it('validateLocalisation fails on missing keys and placeholder mismatches', () => {
    const stdout = runHelpersEval(`
      const missing = validateLocalisation({
        uniqueMissingKeys: ['phase35d5.test.missing.key'],
        placeholderMismatches: [],
        rawKeyRisks: [{ key: 'phase35d5.test.missing.key', reason: 'missing' }],
        hardcodedNonAllowlisted: [],
        statusEnumKeysMissing: [],
      })
      const placeholders = validateLocalisation({
        uniqueMissingKeys: [],
        placeholderMismatches: [{ key: 'example.key', locale: 'es' }],
        rawKeyRisks: [],
        hardcodedNonAllowlisted: [],
        statusEnumKeysMissing: [],
      })
      process.stdout.write(JSON.stringify({ missing, placeholders }))
    `)
    const result = JSON.parse(stdout) as {
      missing: string[]
      placeholders: string[]
    }
    expect(
      result.missing.some(line => line.includes('Missing catalogue keys')),
    ).toBe(true)
    expect(
      result.placeholders.some(line =>
        line.includes('Placeholder parity mismatches'),
      ),
    ).toBe(true)
  })
})
