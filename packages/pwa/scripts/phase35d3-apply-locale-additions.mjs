#!/usr/bin/env node
/**
 * Phase 35D3 — merge proposed ADD keys into PWA locale JSON.
 * Does not call Google Sheets. Sorts keys alphabetically; preserves wrapper shape.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PROPOSED_ADDITIONS } from './phase35d2-proposed-additions.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOCALES_DIR = path.resolve(__dirname, '../src/locales')
const LOCALES = ['nl', 'en', 'es', 'zh']

function mergeLocale(locale) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`)
  const catalog = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const bag = { ...(catalog[locale] ?? {}) }

  for (const entry of PROPOSED_ADDITIONS) {
    bag[entry.key] = entry[locale]
  }

  catalog[locale] = Object.fromEntries(
    Object.entries(bag).sort(([a], [b]) => a.localeCompare(b)),
  )

  fs.writeFileSync(filePath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  return Object.keys(catalog[locale]).length
}

const counts = {}
for (const locale of LOCALES) {
  counts[locale] = mergeLocale(locale)
}
console.log('Phase 35D3 locale merge complete', counts)
