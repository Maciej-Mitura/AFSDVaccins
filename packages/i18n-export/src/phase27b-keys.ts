/**
 * Phase 27B i18n keys for notification centre / push permission UX.
 * EN + NL complete; ES/ZH use Default (EN) fallback in the sheet sync.
 */
export const PHASE_27B_I18N_KEYS = [
  {
    key: 'navigation.apotheker.notifications',
    en: 'Notifications',
    nl: 'Meldingen',
  },
  {
    key: 'navigation.bezorger.notifications',
    en: 'Notifications',
    nl: 'Meldingen',
  },
  {
    key: 'bezorger.notifications.empty.description',
    en: 'You have not received any notifications yet.',
    nl: 'Je hebt nog geen meldingen ontvangen.',
  },
  {
    key: 'notifications.centre.title',
    en: 'Notifications',
    nl: 'Meldingen',
  },
  {
    key: 'notifications.centre.empty.title',
    en: 'No notifications',
    nl: 'Geen meldingen',
  },
  {
    key: 'notifications.centre.empty.description',
    en: 'You have not received any notifications yet.',
    nl: 'Je hebt nog geen meldingen ontvangen.',
  },
  {
    key: 'notifications.centre.loadFailed',
    en: 'Failed to load notifications',
    nl: 'Meldingen laden mislukt',
  },
  {
    key: 'notifications.centre.markRead',
    en: 'Mark as read',
    nl: 'Markeer als gelezen',
  },
  {
    key: 'notifications.centre.markAllRead',
    en: 'Mark all as read',
    nl: 'Alles markeren als gelezen',
  },
  {
    key: 'notifications.centre.openDetails',
    en: 'Open details',
    nl: 'Details openen',
  },
  {
    key: 'notifications.centre.unreadCount',
    en: '{count} unread notifications',
    nl: '{count} ongelezen meldingen',
  },
  {
    key: 'notifications.push.permission.banner.title',
    en: 'Enable notifications',
    nl: 'Meldingen inschakelen',
  },
  // Existing Phase 27A sheet Defaults (keep in sync to avoid conflicts):
  // banner.body Default: "Stay informed about routes and deliveries..."
  // enable Default: "Enable"
  // Local PWA JSON may use the Phase 27B preferred copy; sheet retains 27A Defaults.
  {
    key: 'notifications.push.settings.title',
    en: 'Notification settings',
    nl: 'Meldingsinstellingen',
  },
  {
    key: 'notifications.push.settings.description',
    en: 'Receive updates about deliveries and routes on this device.',
    nl: 'Ontvang updates over leveringen en routes op dit apparaat.',
  },
  {
    key: 'notifications.push.settings.toggle',
    en: 'Push notifications',
    nl: 'Pushmeldingen',
  },
  {
    key: 'notifications.push.status.enabled',
    en: 'Notifications enabled',
    nl: 'Meldingen ingeschakeld',
  },
  {
    key: 'notifications.push.status.disabled',
    en: 'Notifications disabled',
    nl: 'Meldingen uitgeschakeld',
  },
  {
    key: 'notifications.push.status.denied',
    en: 'Permission denied',
    nl: 'Toestemming geweigerd',
  },
  {
    key: 'notifications.push.status.deniedGuidance',
    en: 'Enable notifications in your browser settings for this site, then return here and turn the toggle on.',
    nl: 'Schakel meldingen in via de browserinstellingen voor deze site, keer dan terug en zet de schakelaar aan.',
  },
  {
    key: 'notifications.push.status.unsupported',
    en: 'Notifications unsupported in this browser',
    nl: 'Meldingen worden niet ondersteund in deze browser',
  },
  {
    key: 'notifications.push.status.unavailable',
    en: 'Push notifications are not configured on this device yet',
    nl: 'Pushmeldingen zijn nog niet geconfigureerd op dit apparaat',
  },
  {
    key: 'notifications.push.status.requesting',
    en: 'Requesting notification permission…',
    nl: 'Toestemming voor meldingen vragen…',
  },
  {
    key: 'notifications.push.status.registerFailed',
    en: 'Unable to register notifications',
    nl: 'Meldingen registreren mislukt',
  },
  {
    key: 'notifications.push.status.disableFailed',
    en: 'Unable to disable notifications on this device',
    nl: 'Meldingen uitschakelen op dit apparaat mislukt',
  },
  {
    key: 'notifications.push.status.vapidConfig',
    en: 'Push configuration is incomplete. Contact an administrator.',
    nl: 'Pushconfiguratie is onvolledig. Neem contact op met een beheerder.',
  },
  {
    key: 'notifications.push.actions.retry',
    en: 'Retry',
    nl: 'Opnieuw proberen',
  },
  {
    key: 'errors.notification.markAllReadFailed',
    en: 'Could not mark all notifications as read',
    nl: 'Niet alle meldingen konden als gelezen worden gemarkeerd',
  },
] as const
