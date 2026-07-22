import { expect, test } from './helpers/fixtures'

test.describe('Offline / PWA smoke', () => {
  test('manifest is reachable', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest')
    expect(response.ok()).toBeTruthy()
    const body = await response.json()
    expect(body.name).toContain('Vaccinatie')
    expect(body.display).toBe('standalone')
  })

  test('service worker registers in production-like preview', async ({
    page,
  }) => {
    await page.goto('/auth/login')
    await expect
      .poll(async () => {
        return page.evaluate(async () => {
          if (!('serviceWorker' in navigator)) {
            return false
          }
          const registration = await navigator.serviceWorker.getRegistration()
          return Boolean(registration)
        })
      })
      .toBeTruthy()
  })

  test('offline disables login submit and restoring network re-enables it', async ({
    page,
    context,
  }) => {
    await page.goto('/auth/login')
    await expect(page.getByTestId('login-submit')).toBeEnabled()

    await context.setOffline(true)
    await expect(page.getByTestId('login-offline-alert')).toBeVisible()
    await expect(page.getByTestId('pwa-offline-banner')).toBeVisible()
    await expect(page.getByTestId('login-submit')).toBeDisabled()

    await context.setOffline(false)
    await expect(page.getByTestId('login-offline-alert')).toHaveCount(0)
    await expect(page.getByTestId('login-submit')).toBeEnabled()
  })
})
