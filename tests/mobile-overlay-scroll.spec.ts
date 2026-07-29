import { expect, type Page, test } from './helpers/fixtures'
import { E2E_ACCOUNTS, loginAs } from './helpers/auth'

/**
 * Phase 36B — mobile overlay scroll-lock and single-scroll modal coverage.
 * Uses a phone-sized viewport against real Nuxt UI / Reka Dialog behaviour.
 */
const PHONE = { width: 390, height: 844 }

type OverlayDomState = {
  bodyStyleOverflow: string
  htmlStyleOverflow: string
  bodyComputedOverflow: string
  htmlComputedOverflow: string
  bodyPointerEvents: string
  htmlPointerEvents: string
  openDialogCount: number
  overlaySlotCount: number
  inertCount: number
  mobileNavPresent: boolean
}

async function readOverlayDomState(page: Page): Promise<OverlayDomState> {
  return page.evaluate(() => {
    const body = document.body
    const html = document.documentElement
    const bodyStyle = getComputedStyle(body)
    const htmlStyle = getComputedStyle(html)
    return {
      bodyStyleOverflow: body.style.overflow,
      htmlStyleOverflow: html.style.overflow,
      bodyComputedOverflow: bodyStyle.overflow,
      htmlComputedOverflow: htmlStyle.overflow,
      bodyPointerEvents: bodyStyle.pointerEvents,
      htmlPointerEvents: htmlStyle.pointerEvents,
      openDialogCount: document.querySelectorAll(
        '[role="dialog"][data-state="open"]',
      ).length,
      overlaySlotCount: document.querySelectorAll(
        '[data-slot="overlay"][data-state="open"]',
      ).length,
      inertCount: document.querySelectorAll('[inert]').length,
      mobileNavPresent: Boolean(
        document.querySelector('[data-testid="app-shell-mobile-nav"]'),
      ),
    }
  })
}

function expectScrollUnlocked(state: OverlayDomState): void {
  expect(state.openDialogCount).toBe(0)
  expect(state.overlaySlotCount).toBe(0)
  expect(state.mobileNavPresent).toBe(false)
  // Library may leave '' or restore prior value; must not keep a forced lock.
  expect(['', 'visible', 'auto', 'clip'].includes(state.bodyStyleOverflow)).toBe(
    true,
  )
  expect(state.bodyStyleOverflow).not.toBe('hidden')
  expect(state.htmlStyleOverflow).not.toBe('hidden')
  expect(state.bodyPointerEvents).not.toBe('none')
  expect(state.htmlPointerEvents).not.toBe('none')
}

function expectScrollLockedWhileOverlayOpen(state: OverlayDomState): void {
  expect(state.openDialogCount + state.overlaySlotCount).toBeGreaterThan(0)
  // Reka Dialog modal lock typically sets overflow hidden on body (or via
  // remove-scroll). Accept either style or computed overflow, or open dialog.
  const locked =
    state.bodyStyleOverflow === 'hidden' ||
    state.bodyComputedOverflow === 'hidden' ||
    state.htmlStyleOverflow === 'hidden' ||
    state.openDialogCount > 0
  expect(locked).toBe(true)
}

async function openMobileDrawer(page: Page): Promise<void> {
  await page.getByTestId('app-shell-menu-toggle').click()
  await expect(page.getByTestId('app-shell-mobile-nav')).toBeVisible()
}

async function closeMobileDrawerViaButton(page: Page): Promise<void> {
  await page.getByTestId('app-shell-mobile-nav-close').click()
  await expect(page.getByTestId('app-shell-mobile-nav')).toHaveCount(0)
}

async function waitForOverlaySettled(page: Page): Promise<void> {
  await page.waitForTimeout(350)
}

test.describe('Phase 36B mobile overlay scroll lock', () => {
  test.use({ viewport: PHONE })

  test('drawer open/close restores document scroll (button, backdrop, Escape)', async ({
    page,
  }) => {
    await loginAs(page, E2E_ACCOUNTS.admin)
    await page.goto('/admin/orders')
    await expect(
      page.getByRole('heading', { name: 'Bestellingenbeheer' }),
    ).toBeVisible()

    // Tall page so scrollability is meaningful after unlock.
    await page.evaluate(() => {
      const filler = document.createElement('div')
      filler.setAttribute('data-testid', 'scroll-filler')
      filler.style.height = '2000px'
      document.querySelector('main')?.appendChild(filler)
    })

    await openMobileDrawer(page)
    await waitForOverlaySettled(page)
    expectScrollLockedWhileOverlayOpen(await readOverlayDomState(page))

    await closeMobileDrawerViaButton(page)
    await waitForOverlaySettled(page)
    expectScrollUnlocked(await readOverlayDomState(page))
    await expect(page.getByTestId('scroll-filler')).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 400))
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100)

    await openMobileDrawer(page)
    await waitForOverlaySettled(page)
    // Backdrop / overlay click
    await page.locator('[data-slot="overlay"][data-state="open"]').click({
      position: { x: 8, y: 8 },
      force: true,
    })
    await expect(page.getByTestId('app-shell-mobile-nav')).toHaveCount(0)
    await waitForOverlaySettled(page)
    expectScrollUnlocked(await readOverlayDomState(page))

    await openMobileDrawer(page)
    await waitForOverlaySettled(page)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('app-shell-mobile-nav')).toHaveCount(0)
    await waitForOverlaySettled(page)
    expectScrollUnlocked(await readOverlayDomState(page))
  })

  test('drawer navigation and browser Back restore scroll', async ({
    page,
  }) => {
    await loginAs(page, E2E_ACCOUNTS.admin)
    await page.goto('/admin/orders')
    await expect(
      page.getByRole('heading', { name: 'Bestellingenbeheer' }),
    ).toBeVisible()

    await page.goto('/admin/settings')
    await expect(
      page.getByRole('heading', { name: 'Applicatie-instellingen' }),
    ).toBeVisible()

    await openMobileDrawer(page)
    await waitForOverlaySettled(page)
    expectScrollLockedWhileOverlayOpen(await readOverlayDomState(page))

    await page
      .getByTestId('app-shell-mobile-primary')
      .getByRole('link', { name: 'Bestellingen' })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Bestellingenbeheer' }),
    ).toBeVisible()
    await expect(page.getByTestId('app-shell-mobile-nav')).toHaveCount(0)
    await waitForOverlaySettled(page)
    expectScrollUnlocked(await readOverlayDomState(page))

    await page.goto('/admin/settings')
    await openMobileDrawer(page)
    await waitForOverlaySettled(page)
    await page.goBack()
    await expect(page.getByTestId('app-shell-mobile-nav')).toHaveCount(0, {
      timeout: 15_000,
    })
    await waitForOverlaySettled(page)
    expectScrollUnlocked(await readOverlayDomState(page))
  })

  test('route-template modal closes without nested scroll or stale lock', async ({
    page,
  }) => {
    await loginAs(page, E2E_ACCOUNTS.admin)
    await page.goto('/admin/route-templates')
    await expect(page.getByText('Playwright West')).toBeVisible()

    await page.getByRole('button', { name: 'Nieuwe template' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByRole('heading', { name: 'Nieuwe routetemplate' }),
    ).toBeVisible()

    // Single scroll owner: no nested overflow-y-auto max-height form wrapper.
    const nestedScrollOwners = await dialog.evaluate(root => {
      const scrollables = [...root.querySelectorAll('*')].filter(el => {
        const style = getComputedStyle(el)
        const overflowY = style.overflowY
        if (overflowY !== 'auto' && overflowY !== 'scroll') {
          return false
        }
        return (el as HTMLElement).scrollHeight > (el as HTMLElement).clientHeight + 1
      })
      // Modal body may scroll; nested form must not also be an independent owner.
      return scrollables.map(el => ({
        tag: el.tagName,
        testId: el.getAttribute('data-testid'),
        className: (el as HTMLElement).className,
      }))
    })
    const nestedFormOwners = nestedScrollOwners.filter(entry =>
      String(entry.className).includes('overflow-y-auto'),
    )
    expect(
      nestedFormOwners.filter(entry =>
        String(entry.className).includes('max-h-'),
      ),
    ).toHaveLength(0)

    await waitForOverlaySettled(page)
    expectScrollLockedWhileOverlayOpen(await readOverlayDomState(page))

    await dialog.getByRole('button', { name: 'Annuleren' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await waitForOverlaySettled(page)
    expectScrollUnlocked(await readOverlayDomState(page))
  })

  test('QR modal and sequential overlays restore scroll', async ({ page }) => {
    // Playwright seed routes omit qrConfirmation; regenerate via admin UI so
    // FeatureDeliveryStopQrModal can open with real Nuxt UI overlay lifecycle.
    await loginAs(page, E2E_ACCOUNTS.admin)
    await page.goto('/admin/route-planning')
    await expect(page.getByTestId('admin-route-planning-page')).toBeVisible()

    await page.getByTestId('admin-route-planning-template').click()
    await page.getByRole('option', { name: /Playwright West/i }).click()

    const generate = page.getByTestId('admin-route-planning-generate')
    await generate.click()
    await expect(generate).toContainText(/bevestig|confirm/i)
    await generate.click()
    await expect(page.getByTestId('admin-view-delivery-qr').first()).toBeVisible({
      timeout: 20_000,
    })

    // Drawer then QR modal sequentially.
    await openMobileDrawer(page)
    await waitForOverlaySettled(page)
    await closeMobileDrawerViaButton(page)
    await waitForOverlaySettled(page)
    expectScrollUnlocked(await readOverlayDomState(page))

    await page.getByTestId('admin-view-delivery-qr').first().click()
    const qrDialog = page.getByRole('dialog', { name: 'Bezorg-QR' })
    await expect(qrDialog).toBeVisible()
    await expect(page.getByTestId('delivery-stop-qr-modal-body')).toBeVisible()

    const bodyClass = await page
      .getByTestId('delivery-stop-qr-modal-body')
      .getAttribute('class')
    expect(bodyClass ?? '').toContain('space-y-4')
    expect(bodyClass ?? '').not.toMatch(/overflow-y-auto/)
    expect(bodyClass ?? '').not.toMatch(/max-h-/)

    await waitForOverlaySettled(page)
    expectScrollLockedWhileOverlayOpen(await readOverlayDomState(page))

    await page.getByTestId('delivery-stop-qr-close').click()
    await expect(qrDialog).toHaveCount(0)
    await waitForOverlaySettled(page)
    expectScrollUnlocked(await readOverlayDomState(page))

    // Second overlay pass: drawer after modal.
    await openMobileDrawer(page)
    await waitForOverlaySettled(page)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('app-shell-mobile-nav')).toHaveCount(0)
    await waitForOverlaySettled(page)
    expectScrollUnlocked(await readOverlayDomState(page))
  })
})
