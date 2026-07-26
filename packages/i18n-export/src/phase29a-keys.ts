/**
 * Phase 29A i18n keys for delivery-manifest download controls (PWA UI only).
 * EN + NL complete; ES/ZH use Default (EN) fallback in the sheet sync.
 * PDF body labels remain English-only server constants.
 */
export const PHASE_29A_I18N_KEYS = [
  {
    key: 'deliveryManifest.download',
    en: 'Download manifest',
    nl: 'Download manifest',
  },
  {
    key: 'deliveryManifest.downloadRoute',
    en: 'Download route manifest',
    nl: 'Download routemanifest',
  },
  {
    key: 'deliveryManifest.downloadStop',
    en: 'Download stop manifest',
    nl: 'Download stopmanifest',
  },
  {
    key: 'deliveryManifest.generating',
    en: 'Generating manifest',
    nl: 'Manifest wordt gegenereerd',
  },
  {
    key: 'deliveryManifest.downloaded',
    en: 'Manifest downloaded',
    nl: 'Manifest gedownload',
  },
  {
    key: 'deliveryManifest.error.unable',
    en: 'Unable to generate manifest',
    nl: 'Manifest kon niet worden gegenereerd',
  },
  {
    key: 'deliveryManifest.error.unavailable',
    en: 'Manifest unavailable',
    nl: 'Manifest niet beschikbaar',
  },
  {
    key: 'deliveryManifest.error.forbidden',
    en: 'You do not have access to this manifest',
    nl: 'Je hebt geen toegang tot dit manifest',
  },
  {
    key: 'deliveryManifest.routeTitle',
    en: 'Route manifest',
    nl: 'Routemanifest',
  },
  {
    key: 'deliveryManifest.stopTitle',
    en: 'Stop manifest',
    nl: 'Stopmanifest',
  },
  {
    key: 'deliveryManifest.downloadRouteAria',
    en: 'Download delivery route manifest as PDF',
    nl: 'Download bezorgroutemanifest als PDF',
  },
  {
    key: 'deliveryManifest.downloadStopAria',
    en: 'Download delivery stop manifest as PDF',
    nl: 'Download bezorgstopmanifest als PDF',
  },
] as const
