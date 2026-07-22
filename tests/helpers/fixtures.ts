import { test as base, expect } from '@playwright/test'

import { resetFixtures } from './auth'

/**
 * Extends Playwright test with a fixture reset before each test.
 * Keeps suites repeatable against the shared Playwright API stack.
 */
export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  resetData: [
    async ({ request }, use) => {
      await resetFixtures(request)
      await use(undefined)
    },
    { auto: true },
  ],
})

export { expect }
