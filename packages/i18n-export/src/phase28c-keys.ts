/**
 * Phase 28C i18n keys for courier stop arrival (offline queue + sync).
 * EN + NL complete; ES/ZH use Default (EN) fallback in the sheet sync.
 */
export const PHASE_28C_I18N_KEYS = [
  {
    key: 'arrival.markArrived',
    en: 'Mark arrived',
    nl: 'Markeer aangekomen',
  },
  {
    key: 'arrival.pending',
    en: 'Arrival pending',
    nl: 'Aankomst in behandeling',
  },
  {
    key: 'arrival.arrived',
    en: 'Arrived',
    nl: 'Aangekomen',
  },
  {
    key: 'arrival.arrivedAt',
    en: 'Arrived at {time}',
    nl: 'Aangekomen om {time}',
  },
  {
    key: 'arrival.cancelPending',
    en: 'Cancel pending arrival',
    nl: 'Annuleer openstaande aankomst',
  },
  {
    key: 'arrival.cancelPendingConfirm',
    en: 'Confirm cancel pending arrival',
    nl: 'Bevestig annuleren openstaande aankomst',
  },
  {
    key: 'arrival.synchronising',
    en: 'Synchronising arrival…',
    nl: 'Aankomst wordt gesynchroniseerd…',
  },
  {
    key: 'arrival.recorded',
    en: 'Arrival recorded',
    nl: 'Aankomst geregistreerd',
  },
  {
    key: 'arrival.unableToRecord',
    en: 'Unable to record arrival',
    nl: 'Aankomst kon niet worden geregistreerd',
  },
  {
    key: 'arrival.conflict',
    en: 'Arrival conflict',
    nl: 'Aankomstconflict',
  },
  {
    key: 'arrival.routeChangedOffline',
    en: 'Route changed while offline',
    nl: 'Route is gewijzigd terwijl je offline was',
  },
  {
    key: 'arrival.stopAlreadyDelivered',
    en: 'Stop already delivered',
    nl: 'Stop is al afgeleverd',
  },
  {
    key: 'arrival.retrySync',
    en: 'Retry synchronisation',
    nl: 'Synchronisatie opnieuw proberen',
  },
  {
    key: 'arrival.discardPending',
    en: 'Discard pending action',
    nl: 'Openstaande actie verwerpen',
  },
  {
    key: 'arrival.willSyncWhenOnline',
    en: 'This arrival will sync when online',
    nl: 'Deze aankomst wordt gesynchroniseerd zodra je online bent',
  },
  {
    key: 'errors.deliveryArrival.unauthorized',
    en: 'Sign in again to record arrival.',
    nl: 'Meld je opnieuw aan om aankomst te registreren.',
  },
  {
    key: 'errors.deliveryArrival.forbidden',
    en: 'You cannot record arrival for this route.',
    nl: 'Je mag aankomst voor deze route niet registreren.',
  },
  {
    key: 'errors.deliveryArrival.rateLimited',
    en: 'Too many arrival attempts. Try again later.',
    nl: 'Te veel aankomstpogingen. Probeer later opnieuw.',
  },
  {
    key: 'errors.deliveryArrival.network',
    en: 'Could not reach the server to record arrival.',
    nl: 'Server niet bereikbaar om aankomst te registreren.',
  },
  {
    key: 'errors.deliveryArrival.routeNotFound',
    en: 'Delivery route not found.',
    nl: 'Bezorgroute niet gevonden.',
  },
  {
    key: 'errors.deliveryArrival.stopNotFound',
    en: 'Delivery stop not found.',
    nl: 'Bezorgstop niet gevonden.',
  },
  {
    key: 'errors.deliveryArrival.routeNotStarted',
    en: 'Start the route before recording arrival.',
    nl: 'Start de route voordat je aankomst registreert.',
  },
  {
    key: 'errors.deliveryArrival.routeInactive',
    en: 'Arrival cannot be recorded for an inactive route.',
    nl: 'Aankomst kan niet worden geregistreerd voor een inactieve route.',
  },
  {
    key: 'errors.deliveryArrival.stopAlreadyDelivered',
    en: 'This stop is already delivered.',
    nl: 'Deze stop is al afgeleverd.',
  },
  {
    key: 'errors.deliveryArrival.alreadyRecorded',
    en: 'Arrival was already recorded for this stop.',
    nl: 'Aankomst is al geregistreerd voor deze stop.',
  },
  {
    key: 'errors.deliveryArrival.timestampInvalid',
    en: 'Your device time looks incorrect. Check the clock and try again.',
    nl: 'De tijd op je apparaat lijkt onjuist. Controleer de klok en probeer opnieuw.',
  },
  {
    key: 'errors.deliveryArrival.conflict',
    en: 'Arrival conflicts with a newer route change.',
    nl: 'Aankomst conflicteert met een recentere routewijziging.',
  },
  {
    key: 'errors.deliveryArrival.failed',
    en: 'Recording arrival failed. Try again.',
    nl: 'Aankomst registreren is mislukt. Probeer opnieuw.',
  },
  {
    key: 'errors.deliveryArrival.generic',
    en: 'Unable to record arrival.',
    nl: 'Aankomst kon niet worden geregistreerd.',
  },
] as const
