/**
 * Post-login push permission banner preference helpers.
 *
 * Policy:
 * - Browser Notification.requestPermission() runs only after an explicit click.
 * - "Not now" dismisses the banner without requesting permission.
 * - Dismissal is stored in localStorage (non-sensitive UX preference).
 * - Banner may reappear after 7 days, or immediately when the user opens
 *   settings and deliberately enables notifications.
 * - Permission / subscription state remains authoritative over the dismiss flag.
 */

export const DISMISS_STORAGE_KEY = 'vaccin.pushPermissionBanner.dismissedAt'
/** Legacy boolean dismiss flag from Phase 27A foundation. */
const LEGACY_DISMISS_STORAGE_KEY = 'vaccin.pushPermissionBanner.dismissed'

export const PUSH_BANNER_REPROMPT_MS = 7 * 24 * 60 * 60 * 1000

export type PushPermissionState =
  'unsupported' | 'default' | 'granted' | 'denied'

export type PostLoginBannerInput = {
  isAuthenticated: boolean
  permission?: PushPermissionState
  supportsPush?: boolean
  hasActiveSubscription?: boolean
  nowMs?: number
}

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

function readDismissedAtMs(): number | null {
  if (typeof localStorage === 'undefined') {
    return null
  }

  try {
    const raw = localStorage.getItem(DISMISS_STORAGE_KEY)
    if (raw) {
      const parsed = Number(raw)
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed
      }
    }

    // Migrate legacy '1' flag to a dismiss timestamp so re-prompt works.
    if (localStorage.getItem(LEGACY_DISMISS_STORAGE_KEY) === '1') {
      const migrated = Date.now()
      localStorage.setItem(DISMISS_STORAGE_KEY, String(migrated))
      localStorage.removeItem(LEGACY_DISMISS_STORAGE_KEY)
      return migrated
    }
  } catch {
    return null
  }

  return null
}

export function isPushBannerDismissed(
  nowMs: number = Date.now(),
  rePromptMs: number = PUSH_BANNER_REPROMPT_MS,
): boolean {
  const dismissedAt = readDismissedAtMs()
  if (dismissedAt == null) {
    return false
  }

  return nowMs - dismissedAt < rePromptMs
}

/**
 * Show the enable-notifications banner when the browser supports push,
 * permission is still default/prompt, no active device subscription exists,
 * and the user has not dismissed within the re-prompt window.
 */
export function shouldShowPostLoginPushBanner(
  input: PostLoginBannerInput | boolean,
  permissionArg?: PushPermissionState,
): boolean {
  // Back-compat: shouldShowPostLoginPushBanner(isAuthenticated, permission)
  const normalized: PostLoginBannerInput =
    typeof input === 'boolean'
      ? {
          isAuthenticated: input,
          permission: permissionArg ?? getBrowserPushPermissionState(),
        }
      : input

  const {
    isAuthenticated,
    permission = getBrowserPushPermissionState(),
    supportsPush = true,
    hasActiveSubscription = false,
    nowMs = Date.now(),
  } = normalized

  if (!isAuthenticated || !supportsPush) {
    return false
  }

  if (
    permission === 'unsupported' ||
    permission === 'granted' ||
    permission === 'denied'
  ) {
    return false
  }

  if (hasActiveSubscription) {
    return false
  }

  if (isPushBannerDismissed(nowMs)) {
    return false
  }

  return permission === 'default'
}

export function dismissPostLoginPushBanner(nowMs: number = Date.now()): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  try {
    localStorage.setItem(DISMISS_STORAGE_KEY, String(nowMs))
    localStorage.removeItem(LEGACY_DISMISS_STORAGE_KEY)
  } catch {
    // Quota / private mode — ignore; banner may reappear.
  }
}

/** Clears dismissal so settings "Enable" can show success without waiting 7 days. */
export function clearPostLoginPushBannerDismissal(): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  try {
    localStorage.removeItem(DISMISS_STORAGE_KEY)
    localStorage.removeItem(LEGACY_DISMISS_STORAGE_KEY)
  } catch {
    // ignore
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

export function __resetPushBannerStorageForTests(): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  localStorage.removeItem(DISMISS_STORAGE_KEY)
  localStorage.removeItem(LEGACY_DISMISS_STORAGE_KEY)
}
