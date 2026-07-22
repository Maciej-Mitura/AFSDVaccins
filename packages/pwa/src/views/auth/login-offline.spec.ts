import { describe, expect, it } from 'vitest'

import {
  LOGIN_OFFLINE_MESSAGE,
  shouldBlockLoginWhileOffline,
} from './login-offline'

describe('login-offline', () => {
  it('exposes the Dutch offline login explanation', () => {
    expect(LOGIN_OFFLINE_MESSAGE).toBe(
      'Aanmelden is niet beschikbaar zonder internetverbinding.',
    )
  })

  it('blocks login while offline', () => {
    expect(shouldBlockLoginWhileOffline(false)).toBe(true)
  })

  it('allows login while online', () => {
    expect(shouldBlockLoginWhileOffline(true)).toBe(false)
  })
})
