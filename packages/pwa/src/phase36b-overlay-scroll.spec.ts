/**
 * @vitest-environment happy-dom
 *
 * Phase 36B — single scroll owner for modals; CommonAppShell must not
 * compete with USlideover/Reka Dialog for body scroll lock.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)))

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8')
}

const NESTED_SCROLL_PATTERN =
  /max-h-\[min\([^)]+\)\].*overflow-y-auto|overflow-y-auto.*max-h-\[min\(/

describe('Phase 36B nested modal scroll ownership', () => {
  it('route-template form does not nest overflow-y-auto / max-height inside UModal body', () => {
    const src = readSrc('views/admin/ViewAdminRouteTemplates.vue')
    expect(src).toMatch(/UModal[\s\S]*v-model:open="showForm"/)
    expect(src).toMatch(/UForm[\s\S]*class="space-y-4"/)
    expect(src).not.toMatch(NESTED_SCROLL_PATTERN)
    expect(src).not.toMatch(/overscroll-contain/)
  })

  it('delivery stop QR modal body does not nest vertical scrolling', () => {
    const src = readSrc(
      'components/feature/delivery-qr/FeatureDeliveryStopQrModal.vue',
    )
    expect(src).toMatch(/data-testid="delivery-stop-qr-modal-body"/)
    expect(src).toMatch(
      /data-testid="delivery-stop-qr-modal-body"[\s\S]*?class="space-y-4"|class="space-y-4"[\s\S]*?data-testid="delivery-stop-qr-modal-body"/,
    )
    expect(src).not.toMatch(NESTED_SCROLL_PATTERN)
    expect(src).not.toMatch(/overscroll-contain/)
  })

  it('courier QR preview modal body does not nest vertical scrolling', () => {
    const src = readSrc(
      'components/feature/bezorger/FeatureBezorgerDeliveryQrPreviewModal.vue',
    )
    expect(src).toMatch(/data-testid="delivery-qr-preview-body"/)
    expect(src).toMatch(
      /data-testid="delivery-qr-preview-body"[\s\S]*?class="space-y-4"|class="space-y-4"[\s\S]*?data-testid="delivery-qr-preview-body"/,
    )
    expect(src).not.toMatch(NESTED_SCROLL_PATTERN)
    expect(src).not.toMatch(/overscroll-contain/)
  })
})

describe('Phase 36B CommonAppShell scroll-lock ownership', () => {
  it('does not apply a competing document body overflow lock (library owns lock)', () => {
    const src = readSrc('components/common/CommonAppShell.vue')
    expect(src).not.toMatch(/document\.body\.style\.overflow\s*=/)
    expect(src).not.toMatch(/syncBodyScrollLock/)
    expect(src).toMatch(/USlideover/)
    expect(src).toMatch(/v-model:open="mobileMenuOpen"/)
    expect(src).toMatch(/closeMobileMenu\(\)/)
  })

  it('still closes the drawer on route change and Escape', () => {
    const src = readSrc('components/common/CommonAppShell.vue')
    expect(src).toMatch(/route\.fullPath/)
    expect(src).toMatch(/closeMobileMenu/)
    expect(src).toMatch(/event\.key === 'Escape'/)
    expect(src).toMatch(/focusMenuToggle/)
  })
})
