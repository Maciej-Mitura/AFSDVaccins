import { describe, expect, it } from 'vitest'
import { UserRole } from '@vaccin-delivery/types'

import { resolveProfileCompletionMode } from './profile-completion-mode'

describe('resolveProfileCompletionMode', () => {
  it('returns loading until currentUser is resolved', () => {
    expect(
      resolveProfileCompletionMode({
        authReady: true,
        userLoading: true,
        userInitialized: false,
        currentUser: null,
        missingApplicationUser: false,
      }),
    ).toBe('loading')

    expect(
      resolveProfileCompletionMode({
        authReady: true,
        userLoading: false,
        userInitialized: false,
        currentUser: null,
        missingApplicationUser: false,
      }),
    ).toBe('loading')
  })

  it('does not treat loading as pharmacist completion', () => {
    const mode = resolveProfileCompletionMode({
      authReady: true,
      userLoading: true,
      userInitialized: false,
      currentUser: null,
      missingApplicationUser: false,
    })

    expect(mode).not.toBe('apotheker')
    expect(mode).toBe('loading')
  })

  it('selects pharmacist completion for APOTHEKER', () => {
    expect(
      resolveProfileCompletionMode({
        authReady: true,
        userLoading: false,
        userInitialized: true,
        currentUser: { role: UserRole.Apotheker },
        missingApplicationUser: false,
      }),
    ).toBe('apotheker')
  })

  it('selects courier completion for BEZORGER', () => {
    expect(
      resolveProfileCompletionMode({
        authReady: true,
        userLoading: false,
        userInitialized: true,
        currentUser: { role: UserRole.Bezorger },
        missingApplicationUser: false,
      }),
    ).toBe('bezorger')
  })

  it('selects admin mode for ADMIN (no role-specific profile)', () => {
    expect(
      resolveProfileCompletionMode({
        authReady: true,
        userLoading: false,
        userInitialized: true,
        currentUser: { role: UserRole.Admin },
        missingApplicationUser: false,
      }),
    ).toBe('admin')
  })

  it('switches reactively when currentUser role changes to BEZORGER', () => {
    const before = resolveProfileCompletionMode({
      authReady: true,
      userLoading: false,
      userInitialized: true,
      currentUser: { role: UserRole.Apotheker },
      missingApplicationUser: false,
    })

    const after = resolveProfileCompletionMode({
      authReady: true,
      userLoading: false,
      userInitialized: true,
      currentUser: { role: UserRole.Bezorger },
      missingApplicationUser: false,
    })

    expect(before).toBe('apotheker')
    expect(after).toBe('bezorger')
  })

  it('treats missing application user as unregistered (not pharmacist by role)', () => {
    expect(
      resolveProfileCompletionMode({
        authReady: true,
        userLoading: false,
        userInitialized: true,
        currentUser: null,
        missingApplicationUser: true,
      }),
    ).toBe('unregistered')

    expect(
      resolveProfileCompletionMode({
        authReady: true,
        userLoading: false,
        userInitialized: true,
        currentUser: null,
        missingApplicationUser: true,
      }),
    ).not.toBe('apotheker')
  })
})
