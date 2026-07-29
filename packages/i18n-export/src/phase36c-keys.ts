/**
 * Phase 36C i18n keys for ADMIN route-generation diagnostics and freshness UX.
 * EN/NL/ES/ZH are present in PWA locale JSON. Sync to Google Sheets when ready:
 * npm exec --workspace=@vaccin-delivery/i18n-export -- tsx src/sync-phase36c-keys.ts
 */
export const PHASE_36C_I18N_KEYS = [
  {
    key: 'routes.diagnostics.summary',
    en: 'Stops: {stops}. Orders included: {orders}. Orders skipped: {skippedOrders}. Pharmacies skipped: {skippedPharmacies}.',
    nl: 'Stops: {stops}. Bestellingen opgenomen: {orders}. Bestellingen overgeslagen: {skippedOrders}. Apotheken overgeslagen: {skippedPharmacies}.',
  },
  {
    key: 'routes.diagnostics.reason.notInTemplate',
    en: '{count} pharmacy not in the active template | {count} pharmacies not in the active template',
    nl: '{count} apotheek niet in de actieve template | {count} apotheken niet in de actieve template',
  },
  {
    key: 'routes.diagnostics.reason.noMatchingOrder',
    en: '{count} pharmacy had no matching order for this date | {count} pharmacies had no matching order for this date',
    nl: '{count} apotheek had geen passende bestelling voor deze datum | {count} apotheken hadden geen passende bestelling voor deze datum',
  },
  {
    key: 'routes.diagnostics.reason.statusNotEligible',
    en: '{count} order skipped because status is not eligible | {count} orders skipped because status is not eligible',
    nl: '{count} bestelling overgeslagen omdat de status niet in aanmerking komt | {count} bestellingen overgeslagen omdat de status niet in aanmerking komt',
  },
  {
    key: 'routes.diagnostics.reason.alreadyAssigned',
    en: '{count} order already assigned on another route | {count} orders already assigned on another route',
    nl: '{count} bestelling al toegewezen op een andere route | {count} bestellingen al toegewezen op een andere route',
  },
  {
    key: 'routes.diagnostics.reason.incompletePharmacy',
    en: '{count} pharmacy has incomplete required data | {count} pharmacies have incomplete required data',
    nl: '{count} apotheek heeft onvolledige vereiste gegevens | {count} apotheken hebben onvolledige vereiste gegevens',
  },
  {
    key: 'routes.diagnostics.reason.noActiveTemplate',
    en: 'No active route template is available for generation.',
    nl: 'Er is geen actieve routetemplate beschikbaar voor generatie.',
  },
  {
    key: 'routes.diagnostics.reason.regenerationRequired',
    en: 'New eligible orders arrived after the current route snapshot. Regeneration is required to include them.',
    nl: 'Er zijn nieuwe geschikte bestellingen binnengekomen na de huidige routesnapshot. Regeneratie is nodig om ze op te nemen.',
  },
  {
    key: 'routes.diagnostics.reason.other',
    en: '{count} order or pharmacy was skipped | {count} orders or pharmacies were skipped',
    nl: '{count} bestelling of apotheek werd overgeslagen | {count} bestellingen of apotheken werden overgeslagen',
  },
  {
    key: 'routes.diagnostics.openTemplates',
    en: 'Open route templates',
    nl: 'Open routetemplates',
  },
  {
    key: 'routes.freshness.title',
    en: 'New eligible orders since generation',
    nl: 'Nieuwe geschikte bestellingen sinds generatie',
  },
  {
    key: 'routes.freshness.description',
    en: '{count} eligible unplanned order is not on the current route snapshot (generated {generatedAt}). Regenerate to include it. | {count} eligible unplanned orders are not on the current route snapshot (generated {generatedAt}). Regenerate to include them.',
    nl: '{count} geschikte ongeplande bestelling staat niet op de huidige routesnapshot (gegenereerd {generatedAt}). Regenereer om deze op te nemen. | {count} geschikte ongeplande bestellingen staan niet op de huidige routesnapshot (gegenereerd {generatedAt}). Regenereer om ze op te nemen.',
  },
  {
    key: 'routes.freshness.notGenerated',
    en: 'not yet generated',
    nl: 'nog niet gegenereerd',
  },
  {
    key: 'routes.freshness.snapshotHint',
    en: 'Route generation is a snapshot. Seeing an order in Orders does not mean it is already on a route.',
    nl: 'Routegeneratie is een snapshot. Een bestelling zien onder Bestellingen betekent niet dat deze al op een route staat.',
  },
  {
    key: 'success.routes.generatedPartial',
    en: 'Route generated with {stops} stop(s) and {orders} order(s); some orders or pharmacies were skipped ({skipped}).',
    nl: 'Route gegenereerd met {stops} stop(s) en {orders} bestelling(en); sommige bestellingen of apotheken zijn overgeslagen ({skipped}).',
  },
] as const
