/**
 * Phase 35D2 — deterministic i18n audit script + CSV contract.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pwaRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const repoRoot = path.resolve(pwaRoot, '../..')
const script = path.join(pwaRoot, 'scripts/phase35d2-i18n-audit.mjs')
const csvPath = path.join(repoRoot, 'artifacts/i18n-sheet-import.csv')
const summaryPath = path.join(repoRoot, 'artifacts/i18n-audit-summary.json')
const mdPath = path.join(repoRoot, 'docs/i18n-audit.md')

const EXPECTED_HEADER = 'key,nl,en,es,zh,status,source,notes'

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

describe('phase35d2 i18n audit', () => {
  it('runs deterministically and writes CSV + docs + summary', () => {
    const run = () =>
      execFileSync(process.execPath, [script], {
        encoding: 'utf8',
        cwd: pwaRoot,
      })

    const first = run()
    const csv1 = fs.readFileSync(csvPath, 'utf8')
    const summary1 = fs.readFileSync(summaryPath, 'utf8')
    const md1 = fs.readFileSync(mdPath, 'utf8')

    const second = run()
    const csv2 = fs.readFileSync(csvPath, 'utf8')
    const summary2 = fs.readFileSync(summaryPath, 'utf8')
    const md2 = fs.readFileSync(mdPath, 'utf8')

    expect(first).toContain('Phase 35D2 i18n audit complete')
    expect(second).toContain('Phase 35D2 i18n audit complete')
    expect(second).toContain('Unchanged artifacts/i18n-sheet-import.csv')
    expect(second).toContain('Unchanged docs/i18n-audit.md')
    expect(second).toContain('Unchanged artifacts/i18n-audit-summary.json')
    expect(csv2).toBe(csv1)
    expect(summary2).toBe(summary1)
    expect(md2).toBe(md1)

    expect(csv1.includes('\r')).toBe(false)
    expect(summary1.includes('\r')).toBe(false)
    expect(md1.includes('\r')).toBe(false)
    expect(md1).toContain('artifacts/i18n-sheet-import.csv')
    expect(md1).not.toContain('artifacts\\i18n-sheet-import.csv')
    expect(md1).not.toMatch(/[A-Za-z]:\\/)

    expect(csv1.startsWith(`${EXPECTED_HEADER}\n`)).toBe(true)
    const statuses = new Set(
      csv1.trim().split('\n').slice(1).map(parseCsvStatusColumn),
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

    const summary = JSON.parse(summary1) as {
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
    expect(csv1).toContain('arrival.markArrived')
    expect(csv1).toContain('deliveryManifest.downloadRoute')
    expect(summary.missingKeys).not.toContain('arrival.markArrived')
    expect(summary.missingKeyCount).toBe(0)

    expect(md1).toContain('Phase 35D2')
    expect(md1).toContain('Exact safe commands')
    expect(md1).not.toMatch(/AIza|private_key|BEGIN PRIVATE KEY/)
    expect(Object.prototype.hasOwnProperty.call(summary, 'generatedAt')).toBe(
      false,
    )
  })
})
