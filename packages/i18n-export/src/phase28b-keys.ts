/**
 * Phase 28B i18n keys for offline courier route / notification viewing.
 * EN + NL complete; ES/ZH use Default (EN) fallback in the sheet sync.
 */
export const PHASE_28B_I18N_KEYS = [
  {
    key: 'offline.copy.title',
    en: 'Offline copy',
    nl: 'Offline kopie',
  },
  {
    key: 'offline.copy.description',
    en: 'Some information may have changed.',
    nl: 'Sommige informatie kan zijn gewijzigd.',
  },
  {
    key: 'offline.lastUpdated',
    en: 'Last updated: {dateTime}',
    nl: 'Laatst bijgewerkt: {dateTime}',
  },
  {
    key: 'offline.action.requiresConnection',
    en: 'This action requires an internet connection.',
    nl: 'Deze actie vereist een internetverbinding.',
  },
  {
    key: 'offline.route.unavailable',
    en: 'Route unavailable offline',
    nl: 'Route offline niet beschikbaar',
  },
  {
    key: 'offline.route.openOnlineFirst',
    en: 'Open this route online first.',
    nl: 'Open deze route eerst online.',
  },
  {
    key: 'offline.route.cacheExpired',
    en: 'Cached route expired',
    nl: 'Opgeslagen route is verlopen',
  },
  {
    key: 'offline.route.refreshing',
    en: 'Refreshing route…',
    nl: 'Route wordt vernieuwd…',
  },
  {
    key: 'offline.route.refreshFailed',
    en: 'Could not refresh the route. Showing the offline copy.',
    nl: 'Route vernieuwen mislukt. De offline kopie wordt getoond.',
  },
  {
    key: 'offline.route.backOnline',
    en: 'Back online',
    nl: 'Weer online',
  },
  {
    key: 'offline.route.orderReferences',
    en: 'Orders: {references}',
    nl: 'Bestellingen: {references}',
  },
  {
    key: 'offline.route.orderReferencesOmitted',
    en: 'Order references unavailable in this offline copy.',
    nl: 'Bestelreferenties niet beschikbaar in deze offline kopie.',
  },
  {
    key: 'offline.error.cacheUnavailable',
    en: 'Unable to access offline storage',
    nl: 'Offline opslag is niet toegankelijk',
  },
  {
    key: 'offline.error.networkUnavailable',
    en: 'Could not reach the server. Check your connection and try again.',
    nl: 'Server niet bereikbaar. Controleer je verbinding en probeer opnieuw.',
  },
  {
    key: 'offline.error.authRequired',
    en: 'Sign in again to continue.',
    nl: 'Meld je opnieuw aan om verder te gaan.',
  },
  {
    key: 'offline.error.forbidden',
    en: 'You do not have permission to view this data.',
    nl: 'Je hebt geen toestemming om deze gegevens te bekijken.',
  },
  {
    key: 'offline.error.server',
    en: 'Something went wrong on the server. Please try again.',
    nl: 'Er ging iets mis op de server. Probeer het opnieuw.',
  },
  {
    key: 'offline.notifications.banner',
    en: 'Offline notifications',
    nl: 'Offline meldingen',
  },
  {
    key: 'offline.notifications.readRequiresConnection',
    en: 'Read status cannot be changed offline.',
    nl: 'Leesstatus kan offline niet worden gewijzigd.',
  },
  {
    key: 'offline.notifications.unavailable',
    en: 'Notifications unavailable offline',
    nl: 'Meldingen offline niet beschikbaar',
  },
  {
    key: 'offline.notifications.cacheExpired',
    en: 'Cached notifications expired',
    nl: 'Opgeslagen meldingen zijn verlopen',
  },
  {
    key: 'offline.notifications.refreshFailed',
    en: 'Could not refresh notifications. Showing the offline copy.',
    nl: 'Meldingen vernieuwen mislukt. De offline kopie wordt getoond.',
  },
] as const
