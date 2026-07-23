import {
  API_JSON_BODY_LIMIT_MAX_BYTES,
  assertBodyLimitWithinPolicy,
  isValidBodyLimitSyntax,
  parseBodyLimitToBytes,
} from './body-limit'

describe('body-limit parsing', () => {
  it('parses case-insensitive Express-style units', () => {
    expect(parseBodyLimitToBytes('1mb')).toBe(1024 * 1024)
    expect(parseBodyLimitToBytes('1MB')).toBe(1024 * 1024)
    expect(parseBodyLimitToBytes('100kb')).toBe(100 * 1024)
    expect(parseBodyLimitToBytes('512b')).toBe(512)
    expect(parseBodyLimitToBytes('2gb')).toBe(2 * 1024 * 1024 * 1024)
  })

  it('rejects zero, negative-looking, and malformed values', () => {
    expect(isValidBodyLimitSyntax('0mb')).toBe(false)
    expect(isValidBodyLimitSyntax('-1mb')).toBe(false)
    expect(isValidBodyLimitSyntax('1.5mb')).toBe(false)
    expect(isValidBodyLimitSyntax('1tb')).toBe(false)
    expect(isValidBodyLimitSyntax('mb')).toBe(false)
    expect(() => parseBodyLimitToBytes('0mb')).toThrow(/Invalid body limit/)
    expect(() => parseBodyLimitToBytes('nope')).toThrow(/Invalid body limit/)
  })

  it('enforces the policy maximum', () => {
    expect(assertBodyLimitWithinPolicy('1mb')).toBe(1024 * 1024)
    expect(() => assertBodyLimitWithinPolicy('64mb')).toThrow(/exceeds maximum/)
    expect(API_JSON_BODY_LIMIT_MAX_BYTES).toBe(32 * 1024 * 1024)
  })
})
