import { expect, test } from './helpers/fixtures'
import { API_BASE_URL, E2E_ACCOUNTS, loginAs } from './helpers/auth'

const LOCALE_STORAGE_KEY = 'vaccin-delivery:locale'
const PWA_BASE_URL = 'http://127.0.0.1:4174'

type ResetSeed = {
  ok: boolean
  seed: {
    todayRouteId: string
    todayStopId: string
    pharmacy1Name: string
  }
}

/**
 * Phase 36E UI smoke: per-stop voice controls near QR, not a global tools recorder.
 * Full MediaRecorder upload is covered by PWA vitest with fake media; this suite
 * verifies placement and ADMIN visibility surfaces once the stack is up.
 */
test.describe('Phase 36E stop voice reports', () => {
  test('courier sees stop-bound voice control; admin route planning shows voice section', async ({
    page,
    browser,
    request,
    appLocale,
  }) => {
    const resetResponse = await request.post(`${API_BASE_URL}/__e2e__/reset`)
    expect(resetResponse.ok()).toBeTruthy()
    const resetBody = (await resetResponse.json()) as ResetSeed
    expect(resetBody.seed.todayStopId.length).toBeGreaterThan(5)

    await loginAs(page, E2E_ACCOUNTS.bezorger1)
    await page.goto('/bezorger/today')

    // Start route if needed so IN_PROGRESS stop actions appear.
    const startButton = page.getByTestId('start-route-button')
    if (await startButton.isVisible().catch(() => false)) {
      await startButton.click()
      await expect(page.getByTestId('route-stop-voice-recorder').first()).toBeVisible({
        timeout: 30_000,
      })
    }

    const stopVoice = page.getByTestId('route-stop-voice-recorder')
    await expect(stopVoice.first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('route-tools-section').locator('[data-testid="route-stop-voice-recorder"]')).toHaveCount(0)

    const adminContext = await browser.newContext({
      locale: 'nl-BE',
      timezoneId: 'Europe/Brussels',
      baseURL: PWA_BASE_URL,
    })
    await adminContext.addInitScript(
      ({ key, locale }) => {
        window.localStorage.setItem(key, locale)
      },
      { key: LOCALE_STORAGE_KEY, locale: appLocale },
    )
    const adminPage = await adminContext.newPage()
    await loginAs(adminPage, E2E_ACCOUNTS.admin)
    await adminPage.goto('/admin/route-planning')
    await expect(
      adminPage.getByText(/Live route reports|Spraakrapport|route reports/i).first(),
    ).toBeVisible({ timeout: 30_000 })

    await adminContext.close()
  })
})
