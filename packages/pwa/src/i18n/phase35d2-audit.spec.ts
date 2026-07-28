/**
 * Phase 35D2 / 35D5 — deterministic i18n audit script (check vs update).
 *
 * Tests must never rewrite tracked repository artefacts.
 *
 * @vitest-environment node
 */
import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const pwaRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const repoRoot = path.resolve(pwaRoot, '../..')
const script = path.join(pwaRoot, 'scripts/phase35d2-i18n-audit.mjs')
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
    expect(second.stdout).toContain('Current artifacts/i18n-sheet-import.csv')
    expect(second.stdout).toContain('Current docs/i18n-audit.md')
    expect(second.stdout).toContain('Current artifacts/i18n-audit-summary.json')
    expect(mid).toEqual(before)
    expect(after).toEqual(before)
  })

  it('default CLI mode is check (no writes)', () => {
    const before = snapshotTracked()
    const result = runAudit([])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Phase 35D2 i18n audit check')
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
    expect(artefacts.md).not.toMatch(/AIza|private_key|BEGIN PRIVATE KEY/)
    expect(Object.prototype.hasOwnProperty.call(summary, 'generatedAt')).toBe(
      false,
    )

    // Tracked repo artefacts must remain untouched.
    expect(snapshotTracked()).toEqual(before)
  })

  it('check mode detects stale artefacts under --out-dir', () => {
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

    const result = runAudit(['--check', '--out-dir', outRoot], {
      expectError: true,
    })
    expect(result.status).not.toBe(0)
    const combined = `${result.stdout}\n${result.stderr ?? ''}`
    expect(combined).toContain('Stale i18n audit artefacts')
    expect(combined).toContain('artifacts/i18n-sheet-import.csv')
    expect(combined).toContain('docs/i18n-audit.md')
    expect(combined).toContain('artifacts/i18n-audit-summary.json')
    expect(snapshotTracked()).toEqual(before)
  })

  it('check mode passes against a freshly updated temp out-dir', () => {
    const before = snapshotTracked()
    const outRoot = makeTempRoot()
    runAudit(['--update', '--out-dir', outRoot])
    const check = runAudit(['--check', '--out-dir', outRoot])
    expect(check.status).toBe(0)
    expect(check.stdout).toContain('Current artifacts/i18n-sheet-import.csv')
    expect(snapshotTracked()).toEqual(before)
  })
})
