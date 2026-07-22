import { defineConfig, devices } from '@playwright/test'

const PWA_PORT = 4174
const API_PORT = 3100
const baseURL = `http://127.0.0.1:${PWA_PORT}`

/**
 * Playwright browser E2E (Phase 18).
 * workers=1: shared Nest API + MongoMemoryServer fixtures; parallel workers would race resets.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'nl-BE',
    timezoneId: 'Europe/Brussels',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run test:e2e:pwa:stack --workspace=@vaccin-delivery/api',
      url: `http://127.0.0.1:${API_PORT}/__e2e__/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run test:e2e:pwa:preview --workspace=@vaccin-delivery/pwa',
      url: baseURL,
      reuseExistingServer: false,
      timeout: 300_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
