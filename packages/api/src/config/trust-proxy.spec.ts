import { parseTrustProxy } from './trust-proxy'

describe('parseTrustProxy', () => {
  it('disables trust proxy for unset/false/0', () => {
    expect(parseTrustProxy(undefined)).toBe(false)
    expect(parseTrustProxy(null)).toBe(false)
    expect(parseTrustProxy('')).toBe(false)
    expect(parseTrustProxy(false)).toBe(false)
    expect(parseTrustProxy(0)).toBe(false)
    expect(parseTrustProxy('false')).toBe(false)
    expect(parseTrustProxy('0')).toBe(false)
  })

  it('accepts exactly one proxy hop', () => {
    expect(parseTrustProxy(1)).toBe(1)
    expect(parseTrustProxy('1')).toBe(1)
  })

  it('rejects true and other unsafe values', () => {
    expect(() => parseTrustProxy(true)).toThrow(/TRUST_PROXY/)
    expect(() => parseTrustProxy('true')).toThrow(/TRUST_PROXY/)
    expect(() => parseTrustProxy(2)).toThrow(/TRUST_PROXY/)
    expect(() => parseTrustProxy('yes')).toThrow(/TRUST_PROXY/)
  })
})
