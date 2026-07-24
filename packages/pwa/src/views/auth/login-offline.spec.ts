import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { __resetAppI18nForTests } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

import {
  getLoginOfflineMessage,
  LOGIN_OFFLINE_MESSAGE,
  LOGIN_OFFLINE_MESSAGE_KEY,
  shouldBlockLoginWhileOffline,
} from './login-offline'

describe('login-offline', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('nl')
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('exposes the offline login key and translated message', () => {
    expect(LOGIN_OFFLINE_MESSAGE_KEY).toBe('auth.login.offline')
    expect(getLoginOfflineMessage()).toBe(
      'Aanmelden is niet beschikbaar zonder internetverbinding.',
    )
    expect(LOGIN_OFFLINE_MESSAGE()).toBe(getLoginOfflineMessage())
  })

  it('blocks login while offline', () => {
    expect(shouldBlockLoginWhileOffline(false)).toBe(true)
  })

  it('allows login while online', () => {
    expect(shouldBlockLoginWhileOffline(true)).toBe(false)
  })
})
