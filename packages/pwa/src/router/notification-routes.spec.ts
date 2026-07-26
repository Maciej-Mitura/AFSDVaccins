/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'

import router from '@/router'

describe('notification navigation per role', () => {
  it('ADMIN has notifications route', () => {
    const resolved = router.resolve('/admin/notifications')
    expect(resolved.name).toBe('admin-notifications')
  })

  it('APOTHEKER has notifications route', () => {
    const resolved = router.resolve('/apotheker/notifications')
    expect(resolved.name).toBe('apotheker-notifications')
  })

  it('BEZORGER now has notifications route', () => {
    const resolved = router.resolve('/bezorger/notifications')
    expect(resolved.name).toBe('bezorger-notifications')
  })
})
