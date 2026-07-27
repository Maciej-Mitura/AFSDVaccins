/**
 * Locally merge Phase 34C keys into PWA locale JSON catalogs.
 * ES/ZH receive English values (Default fallback policy).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PHASE_34C_I18N_KEYS } from './phase34c-keys.js'

const here = dirname(fileURLToPath(import.meta.url))
const localesDir = join(here, '../../pwa/src/locales')

for (const locale of ['en', 'nl', 'es', 'zh'] as const) {
  const path = join(localesDir, `${locale}.json`)
  const catalog = JSON.parse(readFileSync(path, 'utf8')) as Record<
    string,
    Record<string, string>
  >
  const bag = catalog[locale]
  for (const entry of PHASE_34C_I18N_KEYS) {
    bag[entry.key] = locale === 'nl' ? entry.nl : entry.en
  }
  catalog[locale] = Object.fromEntries(
    Object.entries(bag).sort(([a], [b]) => a.localeCompare(b)),
  )
  writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`)
  console.info(
    `Updated ${locale} (+${PHASE_34C_I18N_KEYS.length} Phase 34C keys)`,
  )
}
