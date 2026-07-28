import { expect, test } from './helpers/fixtures'
import { E2E_ACCOUNTS, loginAs } from './helpers/auth'

test.describe('APOTHEKER journey', () => {
  test('pharmacist creates an order and sees only own orders', async ({
    page,
  }) => {
    await loginAs(page, E2E_ACCOUNTS.apotheker1)

    await expect(
      page.getByRole('heading', { name: 'Apotheker dashboard' }),
    ).toBeVisible()

    await page.getByRole('link', { name: 'Nieuwe bestelling' }).click()
    await expect(
      page.getByRole('heading', { name: 'Nieuwe bestelling' }),
    ).toBeVisible()

    // Prefer vaccine placeholder text — shell language USelect is also a combobox.
    await page.getByText('Selecteer vaccin').click()
    await page.getByRole('option', { name: 'Playwright Flu' }).click()
    await page.getByTestId('add-quantity-input').fill('2')
    await page.getByRole('button', { name: 'Regel toevoegen' }).click()

    const orderLine = page.getByTestId('order-line')
    await expect(orderLine).toBeVisible()
    await expect(orderLine.getByText('Playwright Flu')).toBeVisible()
    await expect(orderLine.getByRole('spinbutton', { name: 'Aantal' })).toHaveValue(
      '2',
    )

    await page.getByTestId('place-order').click()

    await expect(
      page.getByRole('heading', { name: 'Mijn bestellingen' }),
    ).toBeVisible()

    await expect(page.getByTestId('order-card').first()).toBeVisible()
    await expect(page.getByText(/Leverdatum:/).first()).toBeVisible()
    await expect(page.locator('text=/\\d{2}\\/\\d{2}\\/\\d{4}/').first()).toBeVisible()
  })

  test('another pharmacist order list stays scoped', async ({ page }) => {
    await loginAs(page, E2E_ACCOUNTS.apotheker2)
    await page
      .getByTestId('app-shell-primary-nav')
      .getByRole('link', { name: 'Mijn bestellingen' })
      .click()

    await expect(
      page.getByRole('heading', { name: 'Mijn bestellingen' }),
    ).toBeVisible()

    // Apotheker2 has one seeded order; must not show apotheker1 pharmacy name in list.
    await expect(page.getByText('E2E Apotheek 1')).toHaveCount(0)
  })
})
