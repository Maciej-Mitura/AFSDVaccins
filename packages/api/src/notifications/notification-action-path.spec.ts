import {
  isInternalActionPath,
  sanitizeInternalActionPath,
} from './notification-action-path'

describe('notification-action-path', () => {
  it('accepts internal relative paths', () => {
    expect(isInternalActionPath('/admin/orders')).toBe(true)
    expect(isInternalActionPath('/bezorger/today')).toBe(true)
    expect(isInternalActionPath('/apotheker/orders')).toBe(true)
  })

  it('rejects external or unsafe paths', () => {
    expect(isInternalActionPath('https://evil.example')).toBe(false)
    expect(isInternalActionPath('//evil.example')).toBe(false)
    expect(isInternalActionPath('/\\evil')).toBe(false)
    expect(sanitizeInternalActionPath('https://x')).toBeNull()
  })
})
