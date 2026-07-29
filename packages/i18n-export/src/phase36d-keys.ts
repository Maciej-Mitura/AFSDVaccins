/**
 * Phase 36D i18n keys for delivery state machine / route completion guard copy.
 * EN/NL/ES/ZH are present in PWA locale JSON. Sync to Google Sheets when ready.
 */
export const PHASE_36D_I18N_KEYS = [
  {
    key: 'arrival.markArrived',
    en: 'Mark as arrived',
    nl: 'Markeer als aangekomen',
  },
  {
    key: 'arrival.notDeliveredYet',
    en: 'Arrived — not delivered yet',
    nl: 'Aangekomen — nog niet geleverd',
  },
  {
    key: 'arrival.confirmDeliveryNextStep',
    en: 'Confirm delivery with the pharmacy QR to finalise this stop.',
    nl: 'Bevestig de levering met de apotheek-QR om deze stop af te ronden.',
  },
  {
    key: 'bezorger.route.complete.blocked',
    en: 'Complete remaining deliveries first',
    nl: 'Rond eerst de resterende leveringen af',
  },
  {
    key: 'bezorger.route.complete.cannotComplete',
    en: 'This route cannot be completed yet',
    nl: 'Deze route kan nog niet worden afgerond',
  },
  {
    key: 'bezorger.route.complete.incompleteStops',
    en: '{count} stop still needs delivery confirmation | {count} stops still need delivery confirmation',
    nl: '{count} stop heeft nog een leveringsbevestiging nodig | {count} stops hebben nog een leveringsbevestiging nodig',
  },
  {
    key: 'bezorger.route.qr.confirmDelivery',
    en: 'Confirm delivery',
    nl: 'Bevestig levering',
  },
  {
    key: 'bezorger.route.qr.nextStepAfterArrival',
    en: 'Next step: confirm delivery with the pharmacy QR. Arrival does not mark the order as delivered.',
    nl: 'Volgende stap: bevestig de levering met de apotheek-QR. Aankomst markeert de bestelling niet als geleverd.',
  },
  {
    key: 'errors.route.completionIncompleteStops',
    en: 'Route cannot be completed: {count} stop still needs delivery confirmation. | Route cannot be completed: {count} stops still need delivery confirmation.',
    nl: 'Route kan niet worden afgerond: {count} stop heeft nog een leveringsbevestiging nodig. | Route kan niet worden afgerond: {count} stops hebben nog een leveringsbevestiging nodig.',
  },
  {
    key: 'routes.completion.blocked',
    en: 'Route cannot be completed yet',
    nl: 'Route kan nog niet worden afgerond',
  },
  {
    key: 'routes.completion.completeDeliveriesFirst',
    en: 'Complete remaining deliveries before completing the route.',
    nl: 'Rond eerst de resterende leveringen af voordat u de route afrondt.',
  },
]
