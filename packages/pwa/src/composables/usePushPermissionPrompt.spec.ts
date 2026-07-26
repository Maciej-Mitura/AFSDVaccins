/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetPushBannerStorageForTests,
  dismissPostLoginPushBanner,
  getBrowserPushPermissionState,
  isPushBannerDismissed,
  PUSH_BANNER_REPROMPT_MS,
  requestNotificationPermissionFromUserGesture,
  shouldShowPostLoginPushBanner,
} from './usePushPermissionPrompt'

describe('usePushPermissionPrompt', () => {
  let requestPermission: ReturnType<typeof vi.fn>

  beforeEach(() => {
    __resetPushBannerStorageForTests()
    requestPermission = vi.fn(() => Promise.resolve('granted'))
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      writable: true,
      value: {
        permission: 'default',
        requestPermission,
      },
    })
  })

  afterEach(() => {
    __resetPushBannerStorageForTests()
    vi.restoreAllMocks()
  })

  it('does not request browser permission automatically (helper is gesture-only)', () => {
    expect(getBrowserPushPermissionState()).toBe('default')
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('shows automatic enable banner for eligible authenticated users', () => {
    expect(
      shouldShowPostLoginPushBanner({
        isAuthenticated: true,
        permission: 'default',
        supportsPush: true,
        hasActiveSubscription: false,
      }),
    ).toBe(true)
  })

  it('requests permission only when enable helper is invoked from a gesture', async () => {
    await requestNotificationPermissionFromUserGesture()
    expect(requestPermission).toHaveBeenCalledTimes(1)
  })

  it('dismissing Not now does not request permission', () => {
    dismissPostLoginPushBanner()
    expect(requestPermission).not.toHaveBeenCalled()
    expect(
      shouldShowPostLoginPushBanner({
        isAuthenticated: true,
        permission: 'default',
      }),
    ).toBe(false)
  })

  it('banner dismissal follows bounded 7-day re-prompt policy', () => {
    const now = Date.now()
    dismissPostLoginPushBanner(now)
    expect(isPushBannerDismissed(now)).toBe(true)
    expect(isPushBannerDismissed(now + PUSH_BANNER_REPROMPT_MS + 1)).toBe(false)
    expect(
      shouldShowPostLoginPushBanner({
        isAuthenticated: true,
        permission: 'default',
        nowMs: now + PUSH_BANNER_REPROMPT_MS + 1,
      }),
    ).toBe(true)
  })

  it('hides banner for unsupported or denied browsers', () => {
    expect(
      shouldShowPostLoginPushBanner({
        isAuthenticated: true,
        permission: 'unsupported',
      }),
    ).toBe(false)
    expect(
      shouldShowPostLoginPushBanner({
        isAuthenticated: true,
        permission: 'denied',
      }),
    ).toBe(false)
  })
})
