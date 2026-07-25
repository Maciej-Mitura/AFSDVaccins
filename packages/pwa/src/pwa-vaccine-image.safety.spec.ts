import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const PWA_SRC = join(process.cwd(), 'src')

const FORBIDDEN = [
  /storageKey/,
  /AZURE_STORAGE_CONNECTION_STRING/,
  /AccountKey=/i,
  /VISION_KEY|AZURE_VISION_KEY|ComputerVision/i,
]

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') {
        continue
      }
      walk(full, files)
    } else if (
      /\.(ts|vue|js|mjs)$/.test(entry) &&
      !entry.endsWith('.spec.ts')
    ) {
      files.push(full)
    }
  }
  return files
}

describe('vaccine image PWA safety', () => {
  it('does not expose storageKey, Azure keys or connection strings in PWA source', () => {
    const files = walk(PWA_SRC)
    const violations: string[] = []

    for (const file of files) {
      const content = readFileSync(file, 'utf8')
      for (const pattern of FORBIDDEN) {
        if (pattern.test(content)) {
          violations.push(`${relative(PWA_SRC, file)} matches ${pattern}`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})
