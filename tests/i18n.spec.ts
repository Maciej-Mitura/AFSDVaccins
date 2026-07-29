import { expect, test } from './helpers/fixtures'
import {
  E2E_ACCOUNTS,
  E2E_PASSWORD,
  loginAs,
  switchLanguage,
} from './helpers/auth'

test.describe('Runtime i18n (Phase 23C Batch E)', () => {
  test.describe('1. Login flow NL', () => {
    test('Dutch login shell is visible by default', async ({ page }) => {
      await page.goto('/auth/login')
      await expect(
        page.getByRole('heading', { name: 'Inloggen' }),
      ).toBeVisible()
      await expect(page.getByTestId('login-submit')).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', 'nl')
    })
  })

  test.describe('2–4 + 11. Language switching without reload', () => {
    test('NL → EN updates shell + role content without page reload', async ({
      page,
    }) => {
      let loadCount = 0
      page.on('load', () => {
        loadCount += 1
      })

      await loginAs(page, E2E_ACCOUNTS.admin)
      await expect(
        page.getByRole('heading', { name: 'Admin dashboard' }),
      ).toBeVisible()
      const loadsAfterLogin = loadCount

      await switchLanguage(page, 'English')
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
      await expect(
        page.getByRole('navigation', { name: 'Main navigation' }),
      ).toBeVisible()
      await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()
      await expect(page.getByTestId('logout-button')).toHaveText(/Log out/i)
      expect(loadCount).toBe(loadsAfterLogin)
    })
  })

  test.describe('persisted English', () => {
    test.use({ appLocale: 'en' })

    test('starts in persisted locale when set', async ({ page }) => {
      await page.goto('/auth/login')
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    })

    test('switching EN → ES updates multiple elements', async ({ page }) => {
      await page.goto('/auth/login')
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      await expect(page.getByTestId('login-submit')).toHaveText(/Sign in/i)

      await switchLanguage(page, 'Español')

      await expect(
        page.getByRole('heading', { name: 'Iniciar sesión' }),
      ).toBeVisible()
      await expect(page.getByTestId('login-submit')).toHaveText(
        /Iniciar sesión/i,
      )
      await expect(page.getByRole('link', { name: /Registrarse/i })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    })

    test('login and admin screen show translated content; routing still works', async ({
      page,
    }) => {
      await page.goto('/auth/login')
      await page.getByTestId('login-email').fill(E2E_ACCOUNTS.admin)
      await page.getByTestId('login-password').fill(E2E_PASSWORD)
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

  test.describe('3. Switch ES — multiple elements (from NL)', () => {
    test('NL → ES updates heading, submit, and html lang', async ({ page }) => {
      await page.goto('/auth/login')
      await expect(
        page.getByRole('heading', { name: 'Inloggen' }),
      ).toBeVisible()

      await switchLanguage(page, 'Español')

      await expect(
        page.getByRole('heading', { name: 'Iniciar sesión' }),
      ).toBeVisible()
      await expect(page.getByTestId('login-submit')).toBeVisible()
      await expect(
        page.getByRole('link', { name: /Registrarse|Registreren|Register/i }),
      ).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    })
  })

  test.describe('4. Switch ZH — multiple elements', () => {
    test('NL → ZH updates visible shell text', async ({ page }) => {
      await page.goto('/auth/login')
      await expect(
        page.getByRole('heading', { name: 'Inloggen' }),
      ).toBeVisible()

      await switchLanguage(page, '中文')

      await expect(page.getByRole('heading', { name: '登录' })).toBeVisible()
      await expect(page.getByTestId('login-submit')).toHaveText('登录')
      await expect(page.getByRole('link', { name: '注册' })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh')
    })
  })

  test.describe('5. Locale persistence after reload', () => {
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

  test.describe('6. ADMIN key workflow translated', () => {
    test.use({ appLocale: 'en' })

    test('admin heading and nav are English', async ({ page }) => {
      await loginAs(page, E2E_ACCOUNTS.admin)
      await expect(
        page.getByRole('heading', { name: 'Admin dashboard' }),
      ).toBeVisible()
      await expect(
        page.getByRole('navigation', { name: 'Main navigation' }),
      ).toBeVisible()
      await expect(page.getByRole('link', { name: 'Stock' })).toBeVisible()
      await expect(
        page.getByRole('link', { name: 'Orders', exact: true }),
      ).toBeVisible()
      await expect(
        page.getByRole('link', { name: 'Settings', exact: true }),
      ).toBeVisible()
    })
  })

  test.describe('7. APOTHEKER key workflow translated', () => {
    test.use({ appLocale: 'en' })

    test('pharmacist heading and nav are English', async ({ page }) => {
      await loginAs(page, E2E_ACCOUNTS.apotheker1)
      await expect(
        page.getByRole('heading', { name: 'Pharmacist dashboard' }),
      ).toBeVisible()
      const primaryNav = page.getByTestId('app-shell-primary-nav')
      await expect(
        primaryNav.getByRole('link', { name: 'New order' }),
      ).toBeVisible()
      await expect(
        primaryNav.getByRole('link', { name: 'My orders' }),
      ).toBeVisible()
    })
  })

  test.describe('8. BEZORGER key workflow translated', () => {
    test.use({ appLocale: 'en' })

    test('courier heading and today-route nav are English', async ({ page }) => {
      await loginAs(page, E2E_ACCOUNTS.bezorger1)
      await expect(
        page.getByRole('heading', { name: 'Courier dashboard' }),
      ).toBeVisible()
      await expect(
        page
          .getByTestId('app-shell-primary-nav')
          .getByRole('link', { name: "Today's route" }),
      ).toBeVisible()
    })
  })

  test.describe('9. Validation / error message translated', () => {
    test('invalid credentials error follows locale', async ({ page }) => {
      await page.goto('/auth/login')
      await page.getByTestId('login-email').fill('nobody@example.com')
      await page.getByTestId('login-password').fill(E2E_PASSWORD)
      await page.getByTestId('login-submit').click()
      await expect(
        page.getByText(
          'Onjuiste inloggegevens. Controleer e-mail en wachtwoord.',
        ),
      ).toBeVisible()

      await switchLanguage(page, 'English')
      await page.getByTestId('login-email').fill('nobody@example.com')
      await page.getByTestId('login-password').fill(E2E_PASSWORD)
      await page.getByTestId('login-submit').click()
      await expect(
        page.getByText(
          'Incorrect credentials. Check email and password.',
        ),
      ).toBeVisible()
    })

    test('client validation message is translated', async ({ page }) => {
      await page.goto('/auth/login')
      await page.getByTestId('login-email').fill('not-an-email')
      await page.getByTestId('login-password').fill('short')
      await page.getByTestId('login-submit').click()
      await expect(
        page.getByText(/geldig e-mailadres|valid email/i).first(),
      ).toBeVisible()

      await switchLanguage(page, 'English')
      await page.getByTestId('login-email').fill('not-an-email')
      await page.getByTestId('login-password').fill('short')
      await page.getByTestId('login-submit').click()
      await expect(
        page.getByText(/valid email address/i).first(),
      ).toBeVisible()
    })
  })

  test.describe('10. Status label changes with locale', () => {
    test('bezorger route status label updates when switching language', async ({
      page,
    }) => {
      await loginAs(page, E2E_ACCOUNTS.bezorger1)
      await page.getByRole('link', { name: 'Route vandaag' }).click()

      const status = page.getByTestId('route-status')
      await expect(status).toHaveText('Toegewezen', { timeout: 30_000 })

      await switchLanguage(page, 'English')
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
      await expect(status).toHaveText('Assigned')
    })
  })

  test.describe('11. No reload during language switch (login)', () => {
    test('switching language on login does not fire extra load', async ({
      page,
    }) => {
      let loadCount = 0
      page.on('load', () => {
        loadCount += 1
      })

      await page.goto('/auth/login')
      await expect(
        page.getByRole('heading', { name: 'Inloggen' }),
      ).toBeVisible()
      const afterGoto = loadCount

      await switchLanguage(page, 'English')
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      expect(loadCount).toBe(afterGoto)
      await expect(page).toHaveURL(/\/auth\/login/)
    })
  })

  test.describe('12. Existing auth / route behavior', () => {
    test('default Dutch login still works for apotheker journey', async ({
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

    test('role isolation still redirects unauthorized admin screens', async ({
      page,
    }) => {
      await loginAs(page, E2E_ACCOUNTS.apotheker1)
      await page.goto('/admin/settings')
      await expect(page.getByText('Geen toegang')).toBeVisible()
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
})
