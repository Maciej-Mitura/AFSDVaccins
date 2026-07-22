import {
  E2E_TOKENS,
  isE2eAuthBypassEnabled,
  verifyE2eBypassToken,
} from './e2e-auth-bypass'

describe('e2e-auth-bypass', () => {
  it('requires both NODE_ENV=test and ALLOW_E2E_AUTH_BYPASS', () => {
    expect(
      isE2eAuthBypassEnabled({
        NODE_ENV: 'test',
        ALLOW_E2E_AUTH_BYPASS: 'true',
      }),
    ).toBe(true)

    expect(
      isE2eAuthBypassEnabled({
        NODE_ENV: 'development',
        ALLOW_E2E_AUTH_BYPASS: 'true',
      }),
    ).toBe(false)

    expect(
      isE2eAuthBypassEnabled({
        NODE_ENV: 'production',
        ALLOW_E2E_AUTH_BYPASS: 'true',
      }),
    ).toBe(false)

    expect(
      isE2eAuthBypassEnabled({
        NODE_ENV: 'test',
        ALLOW_E2E_AUTH_BYPASS: 'false',
      }),
    ).toBe(false)

    expect(isE2eAuthBypassEnabled({ NODE_ENV: 'test' })).toBe(false)
  })

  it('resolves known tokens and rejects unknown ones', () => {
    const decoded = verifyE2eBypassToken(E2E_TOKENS.admin)
    expect(decoded.uid).toBe('e2e-firebase-admin')
    expect(decoded.email).toBe('e2e-admin@example.com')

    expect(() => verifyE2eBypassToken('not-a-token')).toThrow('Invalid E2E token')
  })
})
