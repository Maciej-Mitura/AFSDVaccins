/** Shared copy and guards for offline login UX (Phase 16). */

export const LOGIN_OFFLINE_MESSAGE =
  'Aanmelden is niet beschikbaar zonder internetverbinding.'

export function shouldBlockLoginWhileOffline(isOnline: boolean): boolean {
  return !isOnline
}
