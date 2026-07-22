import { expect, test } from './helpers/fixtures'
import { E2E_ACCOUNTS, loginAs } from './helpers/auth'

test.describe('Role isolation', () => {
  test('APOTHEKER cannot access ADMIN routes', async ({ page }) => {
    await loginAs(page, E2E_ACCOUNTS.apotheker1)
    await page.goto('/admin')
    await expect(page.getByText('Geen toegang')).toBeVisible()
  })

  test('BEZORGER cannot access ADMIN routes', async ({ page }) => {
    await loginAs(page, E2E_ACCOUNTS.bezorger1)
    await page.goto('/admin/orders')
    await expect(page.getByText('Geen toegang')).toBeVisible()
  })

  test('ADMIN cannot access BEZORGER-only tomorrow preview', async ({
    page,
  }) => {
    await loginAs(page, E2E_ACCOUNTS.admin)
    await page.goto('/bezorger/tomorrow')
    await expect(page.getByText('Geen toegang')).toBeVisible()
    await expect(page.getByTestId('tomorrow-preview-label')).toHaveCount(0)
  })
})
