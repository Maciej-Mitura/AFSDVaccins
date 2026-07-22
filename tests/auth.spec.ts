import { expect, test } from './helpers/fixtures'
import {
  E2E_ACCOUNTS,
  E2E_PASSWORD,
  loginAs,
  logout,
} from './helpers/auth'

test.describe('Authentication journeys', () => {
  test('login page loads for unauthenticated users', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Inloggen' })).toBeVisible()
    await expect(page.getByTestId('login-submit')).toBeVisible()
  })

  test('invalid login shows a safe error', async ({ page }) => {
    await page.goto('/auth/login')
    await page.getByLabel('E-mailadres').fill('nobody@example.com')
    await page.getByLabel('Wachtwoord').fill(E2E_PASSWORD)
    await page.getByTestId('login-submit').click()

    await expect(
      page.getByText('Onjuiste inloggegevens. Controleer e-mail en wachtwoord.'),
    ).toBeVisible()
    await expect(page).toHaveURL(/\/auth\/login/)
  })

  test('ADMIN can sign in and sees admin navigation', async ({ page }) => {
    await loginAs(page, E2E_ACCOUNTS.admin)
    await expect(
      page.getByRole('heading', { name: 'Admin dashboard' }),
    ).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: 'Hoofdnavigatie' }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Instellingen' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Voorraad' })).toBeVisible()
  })

  test('APOTHEKER can sign in', async ({ page }) => {
    await loginAs(page, E2E_ACCOUNTS.apotheker1)
    await expect(
      page.getByRole('heading', { name: 'Apotheker dashboard' }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Nieuwe bestelling' }),
    ).toBeVisible()
  })

  test('BEZORGER can sign in', async ({ page }) => {
    await loginAs(page, E2E_ACCOUNTS.bezorger1)
    await expect(
      page.getByRole('heading', { name: 'Bezorger dashboard' }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Route vandaag' }),
    ).toBeVisible()
  })

  test('logout returns to login', async ({ page }) => {
    await loginAs(page, E2E_ACCOUNTS.admin)
    await logout(page)
    await expect(page).toHaveURL(/\/auth\/login/)
  })
})
