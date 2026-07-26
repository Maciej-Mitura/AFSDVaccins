import { describe, expect, it } from 'vitest'

import {
  isInternalActionPath,
  sanitizeInternalActionPath,
} from './notification-action-path'

describe('notification action path', () => {
  it('accepts only internal relative action paths', () => {
    expect(isInternalActionPath('/bezorger/today')).toBe(true)
    expect(isInternalActionPath('/apotheker/orders')).toBe(true)
    expect(sanitizeInternalActionPath('/admin/notifications')).toBe(
      '/admin/notifications',
    )
  })

  it('rejects external arbitrary URLs and open redirects', () => {
    expect(isInternalActionPath('https://evil.example')).toBe(false)
    expect(isInternalActionPath('//evil.example')).toBe(false)
    expect(isInternalActionPath('javascript:alert(1)')).toBe(false)
    expect(isInternalActionPath('../escape')).toBe(false)
    expect(sanitizeInternalActionPath('https://evil.example')).toBeNull()
  })
})
