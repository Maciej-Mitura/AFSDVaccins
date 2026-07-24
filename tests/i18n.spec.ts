import { expect, test } from './helpers/fixtures'
import { E2E_ACCOUNTS, E2E_PASSWORD, loginAs } from './helpers/auth'

test.describe('Runtime i18n (Phase 23B)', () => {
  test.describe('persisted English', () => {
    test.use({ appLocale: 'en' })

    test('starts in persisted locale when set', async ({ page }) => {
      await page.goto('/auth/login')
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    })

    test('switching EN → ES updates visible text', async ({ page }) => {
      await page.goto('/auth/login')
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

      await page.getByTestId('language-selector').click()
      await page.getByRole('option', { name: 'Español' }).click()

      await expect(
        page.getByRole('heading', { name: 'Iniciar sesión' }),
      ).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    })

    test('login and admin screen show translated content; routing still works', async ({
      page,
    }) => {
      await page.goto('/auth/login')
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

      await page.getByLabel('Email address').fill(E2E_ACCOUNTS.admin)
      await page.getByLabel('Password').fill(E2E_PASSWORD)
      await page.getByTestId('login-submit').click()

      await expect(
        page.getByRole('heading', { name: 'Admin dashboard' }),
      ).toBeVisible({ timeout: 30_000 })
      await expect(
        page.getByRole('navigation', { name: 'Main navigation' }),
      ).toBeVisible()
      await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    })
  })

  test.describe('browser Spanish (no persisted choice)', () => {
    test.use({ appLocale: 'browser' })

    test('uses browser locale when no persisted choice exists', async ({
      page,
    }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'languages', {
          configurable: true,
          get: () => ['es-ES', 'es'],
        })
        Object.defineProperty(navigator, 'language', {
          configurable: true,
          get: () => 'es-ES',
        })
      })

      await page.goto('/auth/login')
      await expect(
        page.getByRole('heading', { name: 'Iniciar sesión' }),
      ).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    })
  })

  test.describe('persisted Chinese', () => {
    test.use({ appLocale: 'zh' })

    test('locale persists after reload', async ({ page }) => {
      await page.goto('/auth/login')
      await expect(page.getByRole('heading', { name: '登录' })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh')

      await page.reload()
      await expect(page.getByRole('heading', { name: '登录' })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh')
    })
  })

  test.describe('default Dutch', () => {
    test('switching NL → EN updates shell text without reload', async ({
      page,
    }) => {
      await page.goto('/auth/login')
      await expect(
        page.getByRole('heading', { name: 'Inloggen' }),
      ).toBeVisible()

      await page.getByTestId('language-selector').click()
      await page.getByRole('option', { name: 'English' }).click()

      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
      await expect(page).toHaveURL(/\/auth\/login/)
    })

    test('switching NL → ZH updates visible shell text', async ({ page }) => {
      await page.goto('/auth/login')
      await expect(
        page.getByRole('heading', { name: 'Inloggen' }),
      ).toBeVisible()

      await page.getByTestId('language-selector').click()
      await page.getByRole('option', { name: '中文' }).click()

      await expect(page.getByRole('heading', { name: '登录' })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh')
    })

    test('default Dutch login still works for existing role journeys', async ({
      page,
    }) => {
      await loginAs(page, E2E_ACCOUNTS.apotheker1)
      await expect(
        page.getByRole('heading', { name: 'Apotheker dashboard' }),
      ).toBeVisible()
      await expect(
        page.getByRole('link', { name: 'Nieuwe bestelling' }),
      ).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', 'nl')
    })
  })
})
