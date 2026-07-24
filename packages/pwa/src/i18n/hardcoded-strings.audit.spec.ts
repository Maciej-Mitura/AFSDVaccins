/**
 * Soft Vitest companion to scripts/audit-hardcoded-strings.mjs.
 *
 * Always passes. Logs candidate count for local visibility.
 * Limitations: heuristic Dutch word list; ignores catalogs/tests/comments;
 * brand names and backend data produce false positives — not a CI blocker.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const script = path.join(root, 'scripts/audit-hardcoded-strings.mjs')

describe('hardcoded Dutch string audit (soft)', () => {
  it('runs report-only and does not fail the suite', () => {
    const output = execFileSync(process.execPath, [script], {
      encoding: 'utf8',
      cwd: root,
    })
    // eslint-disable-next-line no-console
    console.log(output)
    expect(output).toContain('Exit 0')
    expect(output).toMatch(/migration candidates/)
  })
})
