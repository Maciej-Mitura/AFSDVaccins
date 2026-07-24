import { test as base, expect } from '@playwright/test'

import { resetFixtures } from './auth'

const LOCALE_STORAGE_KEY = 'vaccin-delivery:locale'

type Fixtures = {
  /** Persisted locale for the test. Use `browser` to leave unset and rely on navigator. */
  appLocale: string
  resetData: undefined
}

/**
 * Extends Playwright test with a fixture reset before each test.
 * Keeps suites repeatable against the shared Playwright API stack.
 *
 * Default `appLocale` is `nl` so existing Dutch assertions stay stable when the
 * CI browser prefers English. Phase 23B i18n specs override via `test.use`.
 */
export const test = base.extend<Fixtures>({
  appLocale: ['nl', { option: true }],

  // eslint-disable-next-line no-empty-pattern
  resetData: [
    async ({ request }, use) => {
      await resetFixtures(request)
      await use(undefined)
    },
    { auto: true },
  ],

  page: async ({ page, appLocale }, use) => {
    await page.addInitScript(
      ({ key, locale }) => {
        if (locale === 'browser') {
          window.localStorage.removeItem(key)
          return
        }
        window.localStorage.setItem(key, locale)
      },
      { key: LOCALE_STORAGE_KEY, locale: appLocale },
    )
    await use(page)
  },
})

export { expect }
