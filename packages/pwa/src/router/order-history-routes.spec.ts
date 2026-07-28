/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'

import router from '@/router'

describe('order history routes', () => {
  it('resolves ADMIN history route', () => {
    const resolved = router.resolve('/admin/history')
    expect(resolved.name).toBe('admin-history')
  })

  it('resolves APOTHEKER history route', () => {
    const resolved = router.resolve('/apotheker/history')
    expect(resolved.name).toBe('apotheker-history')
  })

  it('keeps history under role parent meta', () => {
    const adminMatched = router.resolve('/admin/history').matched
    expect(adminMatched.find(r => r.path === '/admin')?.meta.role).toBe('ADMIN')

    const apothekerMatched = router.resolve('/apotheker/history').matched
    expect(apothekerMatched.find(r => r.path === '/apotheker')?.meta.role).toBe(
      'APOTHEKER',
    )
  })

  it('does not expose history under BEZORGER', () => {
    expect(router.resolve('/bezorger/history').name).toBe('not-found')
  })

  it('does not regress existing order routes', () => {
    expect(router.resolve('/admin/orders').name).toBe('admin-orders')
    expect(router.resolve('/apotheker/orders').name).toBe('apotheker-orders')
    expect(router.resolve('/apotheker/orders/new').name).toBe(
      'apotheker-create-order',
    )
  })
})
