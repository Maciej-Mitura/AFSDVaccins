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
 *
 * Layers covered here vs elsewhere:
 * - UI placement smoke (this file): stop-bound recorders, data-stop-id, ADMIN surface,
 *   APOTHEKER denial, no private storage strings in page HTML.
 * - API upload E2E with fake storage: packages/api voice-report service specs.
 * - Real Azure Blob/Speech: production-safe verification only (not local Playwright).
 * - Full MediaRecorder upload: PWA vitest with fake media (FeatureRouteVoiceRecorder /
 *   useVoiceRecorder specs). Physical microphone is reserved for real-device checks.
 */
test.describe('Phase 36E stop voice reports', () => {
  test('courier sees stop-bound voice controls; admin surface; apotheker denied', async ({
    page,
    browser,
    request,
    appLocale,
  }) => {
    const resetResponse = await request.post(`${API_BASE_URL}/__e2e__/reset`)
    expect(resetResponse.ok()).toBeTruthy()
    const resetBody = (await resetResponse.json()) as ResetSeed
    expect(resetBody.seed.todayStopId.length).toBeGreaterThan(5)
    const seededStopId = resetBody.seed.todayStopId

    await loginAs(page, E2E_ACCOUNTS.bezorger1)
    await page.goto('/bezorger/today')

    const startButton = page.getByTestId('start-route-button')
    if (await startButton.isVisible().catch(() => false)) {
      await startButton.click()
      await expect(page.getByTestId('route-stop-voice-recorder').first()).toBeVisible({
        timeout: 30_000,
      })
    }

    const stopVoice = page.getByTestId('route-stop-voice-recorder')
    await expect(stopVoice.first()).toBeVisible({ timeout: 30_000 })
    const stopCount = await stopVoice.count()
    expect(stopCount).toBeGreaterThanOrEqual(1)

    // Each stop recorder section exposes its stopId; seeded stop must be present.
    const stopIds = await page
      .locator(
        '[data-testid="route-stop-voice-recorder"] [data-testid="route-voice-reports-section"]',
      )
      .evaluateAll(nodes =>
        nodes
          .map(node => node.getAttribute('data-stop-id'))
          .filter((value): value is string => Boolean(value)),
      )
    expect(stopIds.length).toBeGreaterThanOrEqual(1)
    expect(stopIds).toContain(seededStopId)
    expect(new Set(stopIds).size).toBe(stopIds.length)

    await expect(
      page
        .getByTestId('route-tools-section')
        .locator('[data-testid="route-stop-voice-recorder"]'),
    ).toHaveCount(0)

    const html = await page.content()
    expect(html).not.toMatch(/blob\.core\.windows\.net/i)
    expect(html).not.toMatch(/[?&]sig=/i)
    expect(html).not.toMatch(/sha256prefix/i)
    expect(html).not.toMatch(/route-voice-reports\//i)

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
    const adminHtml = await adminPage.content()
    expect(adminHtml).not.toMatch(/blob\.core\.windows\.net/i)
    expect(adminHtml).not.toMatch(/[?&]sig=/i)
    await adminContext.close()

    const apothekerContext = await browser.newContext({
      locale: 'nl-BE',
      timezoneId: 'Europe/Brussels',
      baseURL: PWA_BASE_URL,
    })
    await apothekerContext.addInitScript(
      ({ key, locale }) => {
        window.localStorage.setItem(key, locale)
      },
      { key: LOCALE_STORAGE_KEY, locale: appLocale },
    )
    const apothekerPage = await apothekerContext.newPage()
    await loginAs(apothekerPage, E2E_ACCOUNTS.apotheker1)
    await apothekerPage.goto('/admin/route-planning')
    await expect(apothekerPage.getByText('Geen toegang')).toBeVisible({
      timeout: 30_000,
    })
    await expect(
      apothekerPage.getByTestId('route-stop-voice-recorder'),
    ).toHaveCount(0)
    await apothekerContext.close()
  })
})
