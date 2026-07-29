import { expect, test } from './helpers/fixtures'
import { E2E_ACCOUNTS, loginAs } from './helpers/auth'

test.describe('BEZORGER journey', () => {
  test('courier sees today route, starts, and is blocked from completing undelivered stops', async ({
    page,
  }) => {
    await loginAs(page, E2E_ACCOUNTS.bezorger1)

    await page.getByRole('link', { name: 'Route vandaag' }).click()
    await expect(
      page.getByRole('heading', { name: 'Route van vandaag' }),
    ).toBeVisible()

    await expect(page.getByTestId('route-status')).toHaveText('Toegewezen')
    await expect(page.getByTestId('route-stop')).toContainText('E2E Apotheek 1')
    await expect(page.getByTestId('route-stop')).toContainText('12 dosissen')

    await page.getByTestId('route-start').click()
    await page.getByTestId('route-start').click()
    await expect(page.getByTestId('route-status')).toHaveText('Bezig')

    await page.reload()
    await expect(page.getByTestId('route-status')).toHaveText('Bezig')

    // Phase 36D: completion requires confirmed delivery — arrival/QR not done yet.
    await expect(page.getByTestId('route-complete-blocked')).toBeVisible()
    await expect(page.getByTestId('route-complete')).toBeDisabled()

    await page.getByRole('link', { name: 'Voorbeeld morgen' }).click()
    await expect(page.getByTestId('tomorrow-preview-label')).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Voorbeeldroute voor morgen' }),
    ).toBeVisible()
    await expect(page.getByText('Voorbeeld — niet opgeslagen')).toBeVisible()

    // Preview must not expose start/complete controls.
    await expect(page.getByTestId('route-start')).toHaveCount(0)
    await expect(page.getByTestId('route-complete')).toHaveCount(0)
  })

  test('another courier does not see the first courier route', async ({
    page,
  }) => {
    await loginAs(page, E2E_ACCOUNTS.bezorger2)
    await page.getByRole('link', { name: 'Route vandaag' }).click()

    await expect(page.getByText('Geen route voor vandaag')).toBeVisible()
    await expect(page.getByTestId('route-stop')).toHaveCount(0)
  })
})
