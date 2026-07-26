/**
 * Post-login permission banner foundation (Phase 27A).
 * Actual Notification.requestPermission() must only run after explicit user click.
 * Full UI wiring is a later phase; this module holds preference + guidance helpers.
 */

const DISMISS_STORAGE_KEY = 'vaccin.pushPermissionBanner.dismissed'

export type PushPermissionState =
  'unsupported' | 'default' | 'granted' | 'denied'

export function getBrowserPushPermissionState(): PushPermissionState {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported'
  }

  const permission = Notification.permission
  if (
    permission === 'default' ||
    permission === 'granted' ||
    permission === 'denied'
  ) {
    return permission
  }

  return 'unsupported'
}

export function shouldShowPostLoginPushBanner(
  isAuthenticated: boolean,
  permission: PushPermissionState = getBrowserPushPermissionState(),
): boolean {
  if (!isAuthenticated) {
    return false
  }

  if (permission === 'unsupported' || permission === 'granted') {
    return false
  }

  if (permission === 'denied') {
    return false
  }

  if (typeof localStorage === 'undefined') {
    return true
  }

  return localStorage.getItem(DISMISS_STORAGE_KEY) !== '1'
}

export function dismissPostLoginPushBanner(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(DISMISS_STORAGE_KEY, '1')
  }
}

/**
 * Opens the browser permission dialog. Call only from a user gesture handler.
 */
export async function requestNotificationPermissionFromUserGesture(): Promise<PushPermissionState> {
  if (typeof Notification === 'undefined') {
    return 'unsupported'
  }

  const result = await Notification.requestPermission()
  if (result === 'default' || result === 'granted' || result === 'denied') {
    return result
  }

  return 'unsupported'
}
