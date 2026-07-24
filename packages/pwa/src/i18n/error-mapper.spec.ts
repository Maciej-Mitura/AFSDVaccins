/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloError } from '@apollo/client/core'
import { GraphQLError } from 'graphql'

import {
  __resetAppI18nForTests,
  mapFirebaseAuthError,
  mapUserFacingGraphQLError,
  translate,
} from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'
import { useLanguage } from '@/composables/useLanguage'

function graphqlErrorWithCode(code: string, message = 'backend detail'): ApolloError {
  return new ApolloError({
    graphQLErrors: [
      new GraphQLError(message, {
        extensions: { code },
      }),
    ],
  })
}

describe('error mapper', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('nl')
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('maps known Firebase codes to translated text for nl and en', async () => {
    const nl = mapFirebaseAuthError({ code: 'auth/invalid-credential' })
    expect(nl).toBe(translate('auth.error.invalidCredential'))
    expect(nl.length).toBeGreaterThan(0)
    expect(nl).not.toContain('auth/')

    const { setLocale } = useLanguage()
    await setLocale('en')
    const en = mapFirebaseAuthError({ code: 'auth/invalid-credential' })
    expect(en).toBe(translate('auth.error.invalidCredential'))
    expect(en).not.toBe(nl)
  })

  it('maps GraphQL INSUFFICIENT_STOCK to translated stock error', async () => {
    const nl = mapUserFacingGraphQLError(
      graphqlErrorWithCode('INSUFFICIENT_STOCK', 'Not enough doses left'),
    )
    expect(nl).toBe(translate('errors.stock.insufficient'))
    expect(nl).not.toContain('INSUFFICIENT_STOCK')
    expect(nl).not.toContain('Not enough doses left')

    const { setLocale } = useLanguage()
    await setLocale('en')
    const en = mapUserFacingGraphQLError(
      graphqlErrorWithCode('INSUFFICIENT_STOCK', 'Not enough doses left'),
    )
    expect(en).toBe(translate('errors.stock.insufficient'))
    expect(en).not.toBe(nl)
  })

  it('maps unknown errors to errors.generic', () => {
    expect(mapFirebaseAuthError({ code: 'auth/something-weird' })).toBe(
      translate('errors.generic'),
    )
    expect(mapUserFacingGraphQLError(new Error('boom'))).toBe(
      translate('errors.generic'),
    )
    expect(
      mapUserFacingGraphQLError(graphqlErrorWithCode('UNKNOWN_BACKEND_CODE')),
    ).toBe(translate('errors.generic'))
  })

  it('does not expose stack traces to users', () => {
    const err = new Error('secret failure')
    err.stack = 'Error: secret failure\n    at Object.<anonymous> (secret.ts:1:1)'
    const message = mapUserFacingGraphQLError(err)
    expect(message).toBe(translate('errors.generic'))
    expect(message).not.toContain('secret.ts')
    expect(message).not.toContain('at Object')
    expect(message).not.toContain(err.stack)
  })
})
