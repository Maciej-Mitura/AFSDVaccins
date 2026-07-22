import { expect, test } from './helpers/fixtures'
import { E2E_ACCOUNTS, loginAs } from './helpers/auth'

test.describe('ADMIN journey', () => {
  test('admin can navigate core screens and inspect today route data', async ({
    page,
  }) => {
    await loginAs(page, E2E_ACCOUNTS.admin)

    await page.getByRole('link', { name: 'Instellingen' }).click()
    await expect(
      page.getByRole('heading', { name: 'Applicatie-instellingen' }),
    ).toBeVisible()

    await page.getByRole('link', { name: 'Vaccins' }).click()
    await expect(page.getByText('Playwright Flu')).toBeVisible()

    await page.getByRole('link', { name: 'Voorraad' }).click()
    await expect(
      page.getByRole('heading', { name: 'Voorraadbeheer' }),
    ).toBeVisible()
    await expect(page.getByText('Playwright Flu')).toBeVisible()

    await page.getByRole('link', { name: 'Bestellingen' }).click()
    await expect(
      page.getByRole('heading', { name: 'Bestellingenbeheer' }),
    ).toBeVisible()

    await page.getByRole('link', { name: 'Routetemplates' }).click()
    await expect(page.getByText('Playwright West')).toBeVisible()

    await page.getByRole('link', { name: 'Routeplanning' }).click()
    await expect(
      page.getByRole('heading', { name: 'Routeplanning' }),
    ).toBeVisible()
    await expect(page.getByText(/Playwright West|E2E Courier 1/)).toBeVisible()
  })

  test('unauthorized role cannot access admin screens', async ({ page }) => {
    await loginAs(page, E2E_ACCOUNTS.apotheker1)
    await page.goto('/admin/settings')
    await expect(page.getByText('Geen toegang')).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Applicatie-instellingen' }),
    ).toHaveCount(0)
  })
})
