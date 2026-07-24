import { translate } from '@/i18n'

/** Shared copy and guards for offline login UX (Phase 16 / 23C). */

export const LOGIN_OFFLINE_MESSAGE_KEY = 'auth.login.offline'

export function getLoginOfflineMessage(): string {
  return translate(LOGIN_OFFLINE_MESSAGE_KEY)
}

/**
 * @deprecated Prefer getLoginOfflineMessage() or t(LOGIN_OFFLINE_MESSAGE_KEY).
 * Resolves the current locale message (not a frozen Dutch string).
 */
export const LOGIN_OFFLINE_MESSAGE = getLoginOfflineMessage

export function shouldBlockLoginWhileOffline(isOnline: boolean): boolean {
  return !isOnline
}
