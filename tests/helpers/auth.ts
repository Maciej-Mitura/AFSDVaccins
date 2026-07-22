import { expect, type Page } from '@playwright/test'

export const E2E_PASSWORD = 'playwright-test-password'

export const E2E_ACCOUNTS = {
  admin: 'e2e-admin@example.com',
  apotheker1: 'e2e-apotheker-1@example.com',
  apotheker2: 'e2e-apotheker-2@example.com',
  bezorger1: 'e2e-bezorger-1@example.com',
  bezorger2: 'e2e-bezorger-2@example.com',
} as const

export const API_BASE_URL = 'http://127.0.0.1:3100'

export async function resetFixtures(request: {
  post: (
    url: string,
  ) => Promise<{ ok: () => boolean; json: () => Promise<unknown> }>
}): Promise<void> {
  const response = await request.post(`${API_BASE_URL}/__e2e__/reset`)
  expect(response.ok()).toBeTruthy()
}

export async function loginAs(
  page: Page,
  email: string,
  password: string = E2E_PASSWORD,
): Promise<void> {
  await page.goto('/auth/login')
  await expect(page.getByTestId('login-form')).toHaveAttribute(
    'data-e2e-auth-bypass',
    'true',
  )
  await page.getByLabel('E-mailadres').fill(email)
  await page.getByLabel('Wachtwoord').fill(password)
  await page.getByTestId('login-submit').click()
  await expect(page.getByRole('heading', { name: 'Inloggen' })).toHaveCount(0, {
    timeout: 30_000,
  })
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Uitloggen' }).click()
  await expect(page.getByRole('heading', { name: 'Inloggen' })).toBeVisible()
}
