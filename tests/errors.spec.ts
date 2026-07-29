import { expect, test } from './helpers/fixtures'
import { E2E_ACCOUNTS, loginAs } from './helpers/auth'

test.describe('Error states', () => {
  test('unauthorized route does not show protected content', async ({
    page,
  }) => {
    await loginAs(page, E2E_ACCOUNTS.apotheker1)
    await page.goto('/admin/stock')
    await expect(page.getByText('Geen toegang')).toBeVisible()
    await expect(page.getByText('Playwright Flu')).toHaveCount(0)
  })

  test('API unavailable shows a safe error on a protected page', async ({
    page,
  }) => {
    await loginAs(page, E2E_ACCOUNTS.apotheker1)

    await page.route('**/graphql', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          errors: [{ message: 'Tijdelijke storing' }],
        }),
      })
    })

    await page
      .getByTestId('app-shell-primary-nav')
      .getByRole('link', { name: 'Mijn bestellingen' })
      .click()

    await expect(
      page.getByText(/mislukt|storing|fout|unavailable|Failed/i).first(),
    ).toBeVisible()
    await expect(page.getByTestId('place-order')).toHaveCount(0)
  })

  test('invalid mutation does not leave loading state stuck', async ({
    page,
  }) => {
    await loginAs(page, E2E_ACCOUNTS.apotheker1)
    await page
      .getByTestId('app-shell-primary-nav')
      .getByRole('link', { name: 'Nieuwe bestelling' })
      .click()

    // Empty order: submit control stays disabled and not stuck loading.
    await expect(page.getByTestId('place-order')).toBeDisabled()
    await expect(page.getByTestId('place-order')).not.toHaveAttribute(
      'aria-busy',
      'true',
    )
  })
})
