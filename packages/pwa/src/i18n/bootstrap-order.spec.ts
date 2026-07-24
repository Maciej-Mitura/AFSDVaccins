/**
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('PWA bootstrap order (Phase 23B)', () => {
  it('registers i18n before the router', () => {
    const mainPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../main.ts',
    )
    const source = readFileSync(mainPath, 'utf8')
    const i18nUse = source.indexOf('app.use(i18n)')
    const routerUse = source.indexOf('app.use(router)')
    expect(i18nUse).toBeGreaterThan(-1)
    expect(routerUse).toBeGreaterThan(-1)
    expect(i18nUse).toBeLessThan(routerUse)
    expect(source).toContain('bootstrapI18n')
  })
})
