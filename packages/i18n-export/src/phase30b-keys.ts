/**
 * Phase 30B i18n keys for coarse courier location / upcoming-delivery UI.
 * EN + NL complete; ES/ZH use Default (EN) fallback in the sheet sync.
 */
export const PHASE_30B_I18N_KEYS = [
  {
    key: 'routes.location.title',
    en: 'Courier progress',
    nl: 'Voortgang bezorger',
  },
  {
    key: 'routes.location.lastRecordedCity',
    en: 'Last recorded city',
    nl: 'Laatst geregistreerde stad',
  },
  {
    key: 'routes.location.lastRecordedRouteLocation',
    en: 'Last recorded route location',
    nl: 'Laatst geregistreerde routelocatie',
  },
  {
    key: 'routes.location.yourLastRecordedLocation',
    en: 'Your last recorded location',
    nl: 'Je laatst geregistreerde locatie',
  },
  {
    key: 'routes.location.noneYet',
    en: 'No courier location has been recorded yet.',
    nl: 'Er is nog geen bezorgerlocatie geregistreerd.',
  },
  {
    key: 'routes.location.updatesAfterArrivalOrDelivery',
    en: 'Location updates after you record arrival or confirm delivery.',
    nl: 'De locatie wordt bijgewerkt nadat je aankomst registreert of levering bevestigt.',
  },
  {
    key: 'routes.location.source.arrival',
    en: 'Recorded on arrival',
    nl: 'Geregistreerd bij aankomst',
  },
  {
    key: 'routes.location.source.delivery',
    en: 'Recorded on delivery confirmation',
    nl: 'Geregistreerd bij leveringsbevestiging',
  },
  {
    key: 'routes.location.source.arrivalAtStop',
    en: 'Recorded when the courier arrived at stop {sequence}',
    nl: 'Geregistreerd toen de bezorger aankwam bij stop {sequence}',
  },
  {
    key: 'routes.location.source.deliveryAtStop',
    en: 'Recorded when delivery was confirmed at stop {sequence}',
    nl: 'Geregistreerd toen levering werd bevestigd bij stop {sequence}',
  },
  {
    key: 'routes.location.basisStop',
    en: 'Based on stop {sequence}',
    nl: 'Gebaseerd op stop {sequence}',
  },
  {
    key: 'routes.location.nextStop',
    en: 'Next stop',
    nl: 'Volgende stop',
  },
  {
    key: 'routes.location.nextStopDetail',
    en: '{sequence}. {name} — {city}',
    nl: '{sequence}. {name} — {city}',
  },
  {
    key: 'routes.location.noLaterStop',
    en: 'No later delivery stop remains',
    nl: 'Er blijft geen latere bezorgstop over',
  },
  {
    key: 'routes.location.noNextStopAvailable',
    en: 'No next stop is currently available',
    nl: 'Er is momenteel geen volgende stop beschikbaar',
  },
  {
    key: 'routes.location.historical',
    en: 'Historical location',
    nl: 'Historische locatie',
  },
  {
    key: 'routes.location.unavailable',
    en: 'Unable to load courier location',
    nl: 'Bezorgerlocatie kon niet worden geladen',
  },
  {
    key: 'routes.location.mayBeOutdated',
    en: 'This location may be outdated.',
    nl: 'Deze locatie kan verouderd zijn.',
  },
  {
    key: 'routes.location.notLiveGps',
    en: "This is the city of the courier's latest recorded stop, not live GPS tracking.",
    nl: 'Dit is de stad van de laatst geregistreerde stop van de bezorger, geen live GPS-tracking.',
  },
  {
    key: 'routes.location.yourDeliveryIsNext',
    en: 'Your delivery is next',
    nl: 'Jouw levering is als volgende',
  },
  {
    key: 'routes.location.courierLastLocation',
    en: "Courier's last recorded location: {city}",
    nl: 'Laatst geregistreerde locatie van de bezorger: {city}',
  },
  {
    key: 'routes.location.lastUpdated',
    en: 'Last updated: {dateTime}',
    nl: 'Laatst bijgewerkt: {dateTime}',
  },
  {
    key: 'routes.location.recordedAtLabel',
    en: 'Last updated',
    nl: 'Laatst bijgewerkt',
  },
] as const
