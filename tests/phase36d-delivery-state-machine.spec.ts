import { expect, test } from './helpers/fixtures'
import { API_BASE_URL, E2E_ACCOUNTS, loginAs } from './helpers/auth'

const LOCALE_STORAGE_KEY = 'vaccin-delivery:locale'
const PWA_BASE_URL = 'http://127.0.0.1:4174'

type ResetSeed = {
  ok: boolean
  seed: {
    todayRouteId: string
    todayStopId: string
    todayStopQrToken: string
    todayOrderId: string
    pharmacy1Name: string
  }
}

type ConfirmBody = {
  orderIds?: string[]
  orderCount?: number
  routeStatus?: string
}

async function graphqlRequest(
  request: {
    post: (
      url: string,
      options: {
        headers: Record<string, string>
        data: unknown
      },
    ) => Promise<{
      ok: () => boolean
      json: () => Promise<unknown>
    }>
  },
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<unknown> {
  const response = await request.post(`${API_BASE_URL}/graphql`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: { query, variables },
  })
  expect(response.ok()).toBeTruthy()
  return response.json()
}

test.describe('Phase 36D delivery state machine', () => {
  test('arrival alone does not deliver; completion blocked until QR; pharmacist updates', async ({
    page,
    browser,
    request,
    appLocale,
  }) => {
    const resetResponse = await request.post(`${API_BASE_URL}/__e2e__/reset`)
    expect(resetResponse.ok()).toBeTruthy()
    const resetBody = (await resetResponse.json()) as ResetSeed
    const seed = resetBody.seed
    expect(seed.todayStopQrToken.length).toBeGreaterThan(10)
    expect(seed.todayOrderId.length).toBeGreaterThan(5)

    const pharmacistContext = await browser.newContext({
      locale: 'nl-BE',
      timezoneId: 'Europe/Brussels',
      baseURL: PWA_BASE_URL,
    })
    await pharmacistContext.addInitScript(
      ({ key, locale }) => {
        window.localStorage.setItem(key, locale)
      },
      { key: LOCALE_STORAGE_KEY, locale: appLocale },
    )
    const apothekerPage = await pharmacistContext.newPage()

    await loginAs(apothekerPage, E2E_ACCOUNTS.apotheker1)
    await apothekerPage.goto('/apotheker/orders')
    await expect(
      apothekerPage.getByRole('heading', { name: 'Mijn bestellingen' }),
    ).toBeVisible()

    // Planned deliveries are the live operational surface for this flow.
    await expect(
      apothekerPage.getByTestId('planned-delivery-card').first(),
    ).toBeVisible()
    await expect(
      apothekerPage.getByTestId('planned-delivery-state').first(),
    ).toContainText(/QR beschikbaar|QR available/i)
    await expect(
      apothekerPage.getByTestId('show-delivery-qr').first(),
    ).toBeVisible()

    // Seeded PLANNED order must appear in My Orders (ObjectId/string id match).
    await expect(
      apothekerPage
        .getByTestId('order-card')
        .filter({ hasText: 'Gepland' })
        .first(),
    ).toBeVisible()

    await loginAs(page, E2E_ACCOUNTS.bezorger1)
    await page.getByRole('link', { name: 'Route vandaag' }).click()
    await expect(page.getByTestId('route-status')).toHaveText('Toegewezen')

    await page.getByTestId('route-start').click()
    await page.getByTestId('route-start').click()
    await expect(page.getByTestId('route-status')).toHaveText('Bezig')

    await expect(page.getByTestId('route-stop-lifecycle').first()).toContainText(
      /Gepland|Planned/i,
    )

    const markArrived = page.getByTestId('route-stop-mark-arrived')
    if (await markArrived.count()) {
      await markArrived.click()
      await expect(page.getByTestId('route-stop-arrived')).toBeVisible({
        timeout: 15_000,
      })
      await expect(
        page.getByTestId('route-stop-arrived-not-delivered'),
      ).toBeVisible()
      await expect(page.getByTestId('route-stop-arrived-next-step')).toBeVisible()
    }

    await expect(page.getByTestId('route-complete-blocked')).toBeVisible()
    await expect(page.getByTestId('route-complete')).toBeDisabled()

    // Arrival must not deliver the pharmacist order or consume QR.
    const beforeConfirm = (await graphqlRequest(
      request,
      'e2e-apotheker-1',
      `query { myOrders { id status } }`,
    )) as {
      data: { myOrders: Array<{ id: string; status: string }> }
    }
    const plannedBefore = beforeConfirm.data.myOrders.find(
      order => order.id === seed.todayOrderId,
    )
    expect(plannedBefore?.status).toBe('PLANNED')

    await apothekerPage.reload()
    await expect(
      apothekerPage.getByTestId('show-delivery-qr').first(),
    ).toBeVisible()
    await expect(
      apothekerPage.getByTestId('planned-delivery-confirmed'),
    ).toHaveCount(0)

    const confirmResponse = await request.post(
      `${API_BASE_URL}/delivery-routes/qr/confirm`,
      {
        headers: {
          Authorization: 'Bearer e2e-bezorger-1',
          'Content-Type': 'application/json',
        },
        data: { token: seed.todayStopQrToken },
      },
    )
    expect(confirmResponse.ok()).toBeTruthy()
    const confirmBody = (await confirmResponse.json()) as ConfirmBody
    expect(confirmBody.orderIds ?? []).toContain(seed.todayOrderId)

    const afterConfirm = (await graphqlRequest(
      request,
      'e2e-apotheker-1',
      `query { myOrders { id status } }`,
    )) as {
      data: { myOrders: Array<{ id: string; status: string }> }
    }
    const deliveredOrder = afterConfirm.data.myOrders.find(
      order => order.id === seed.todayOrderId,
    )
    expect(deliveredOrder?.status).toBe('DELIVERED')

    await page.reload()
    await expect(page.getByTestId('route-stop-delivered').first()).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByTestId('route-complete-blocked')).toHaveCount(0)
    await expect(page.getByTestId('route-complete')).toBeEnabled()

    // Pharmacist UI updates while route is still IN_PROGRESS (planned list active).
    await apothekerPage.goto('/apotheker/orders')
    await expect(
      apothekerPage.getByRole('heading', { name: 'Mijn bestellingen' }),
    ).toBeVisible()
    await expect(
      apothekerPage
        .locator('[data-testid="order-card"][data-order-state="completed"]')
        .filter({ hasText: 'Geleverd' })
        .first(),
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      apothekerPage.getByTestId('planned-delivery-confirmed').first(),
    ).toBeVisible()

    await page.getByTestId('route-complete').click()
    await page.getByTestId('route-complete').click()
    await expect(page.getByTestId('route-status')).toHaveText('Voltooid')

    const replay = await request.post(
      `${API_BASE_URL}/delivery-routes/qr/confirm`,
      {
        headers: {
          Authorization: 'Bearer e2e-bezorger-1',
          'Content-Type': 'application/json',
        },
        data: { token: seed.todayStopQrToken },
      },
    )
    expect(replay.ok()).toBeFalsy()

    await apothekerPage.goto('/apotheker/orders')
    await expect(
      apothekerPage
        .locator('[data-testid="order-card"][data-order-state="completed"]')
        .filter({ hasText: 'Geleverd' })
        .first(),
    ).toBeVisible()

    await pharmacistContext.close()
  })
})
