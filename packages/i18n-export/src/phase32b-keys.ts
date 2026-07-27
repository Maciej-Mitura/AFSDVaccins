/**
 * Phase 32B i18n keys for ADMIN courier-performance analytics dashboard.
 * EN + NL complete; ES/ZH use Default (EN) fallback in the sheet sync.
 */
export const PHASE_32B_I18N_KEYS = [
  {
    key: 'navigation.admin.courierAnalytics',
    en: 'Courier analytics',
    nl: 'Bezorgeranalyse',
  },
  {
    key: 'admin.courierAnalytics.title',
    en: 'Courier performance',
    nl: 'Prestaties bezorgers',
  },
  {
    key: 'admin.courierAnalytics.subtitle',
    en: 'All-time analytics across historical assigned and completed delivery work.',
    nl: 'Analyse over de hele periode van historisch toegewezen en afgerond bezorgwerk.',
  },
  {
    key: 'admin.courierAnalytics.calculated',
    en: 'Calculated',
    nl: 'Berekend',
  },
  {
    key: 'admin.courierAnalytics.refresh',
    en: 'Refresh analytics',
    nl: 'Analyse vernieuwen',
  },
  {
    key: 'admin.courierAnalytics.exportCsv',
    en: 'Export CSV',
    nl: 'CSV exporteren',
  },
  {
    key: 'admin.courierAnalytics.retry',
    en: 'Retry',
    nl: 'Opnieuw proberen',
  },
  {
    key: 'admin.courierAnalytics.reliabilityScore',
    en: 'Reliability score',
    nl: 'Betrouwbaarheidsscore',
  },
  {
    key: 'admin.courierAnalytics.componentBreakdown',
    en: 'Component breakdown',
    nl: 'Componentuitsplitsing',
  },
  {
    key: 'admin.courierAnalytics.weightedContribution',
    en: 'Weighted contribution',
    nl: 'Gewogen bijdrage',
  },
  {
    key: 'admin.courierAnalytics.insufficientData',
    en: 'Insufficient data',
    nl: 'Onvoldoende gegevens',
  },
  {
    key: 'admin.courierAnalytics.eligibleData',
    en: 'Eligible data',
    nl: 'Geschikte gegevens',
  },
  {
    key: 'admin.courierAnalytics.count',
    en: 'Count',
    nl: 'Aantal',
  },
  {
    key: 'admin.courierAnalytics.total',
    en: 'Total',
    nl: 'Totaal',
  },
  {
    key: 'admin.courierAnalytics.handlingTime',
    en: 'Handling time',
    nl: 'Afhandeltijd',
  },
  {
    key: 'admin.courierAnalytics.averageHandlingDuration',
    en: 'Average handling duration',
    nl: 'Gemiddelde afhandeltijd',
  },
  {
    key: 'admin.courierAnalytics.medianHandlingDuration',
    en: 'Median handling duration',
    nl: 'Mediane afhandeltijd',
  },
  {
    key: 'admin.courierAnalytics.sampleCount',
    en: 'Sample count',
    nl: 'Aantal steekproeven',
  },
  {
    key: 'admin.courierAnalytics.handling.contextNote',
    en: 'Operational context only — average time between recorded arrival and confirmed delivery. Missing arrival data is excluded. Low duration is not automatically better and is not part of the reliability score.',
    nl: 'Alleen operationele context — gemiddelde tijd tussen geregistreerde aankomst en bevestigde levering. Ontbrekende aankomstgegevens worden uitgesloten. Een korte duur is niet automatisch beter en maakt geen deel uit van de betrouwbaarheidsscore.',
  },
  {
    key: 'admin.courierAnalytics.section.summary',
    en: 'Overall operational performance',
    nl: 'Algemene operationele prestaties',
  },
  {
    key: 'admin.courierAnalytics.section.distributions',
    en: 'Completion, timeliness and proof patterns',
    nl: 'Voltooiings-, tijdigheids- en bewijs­patronen',
  },
  {
    key: 'admin.courierAnalytics.kpi.eligibleCouriers',
    en: 'Couriers with eligible data',
    nl: 'Bezorgers met geschikte gegevens',
  },
  {
    key: 'admin.courierAnalytics.kpi.eligibleSupport',
    en: '{total} couriers in ranking population',
    nl: '{total} bezorgers in de rangschikking',
  },
  {
    key: 'admin.courierAnalytics.kpi.completedRoutes',
    en: 'Completed routes',
    nl: 'Afgeronde routes',
  },
  {
    key: 'admin.courierAnalytics.kpi.deliveredStops',
    en: 'Delivered stops',
    nl: 'Bezorgde stops',
  },
  {
    key: 'admin.courierAnalytics.kpi.overallOnTimeRate',
    en: 'Overall on-time rate',
    nl: 'Algemeen op-tijd-percentage',
  },
  {
    key: 'admin.courierAnalytics.kpi.overallQrRate',
    en: 'Overall QR confirmation rate',
    nl: 'Algemeen QR-bevestigingspercentage',
  },
  {
    key: 'admin.courierAnalytics.kpi.averageReliabilityScore',
    en: 'Average reliability score',
    nl: 'Gemiddelde betrouwbaarheidsscore',
  },
  {
    key: 'admin.courierAnalytics.leaderboard.title',
    en: 'Courier leaderboard',
    nl: 'Ranglijst bezorgers',
  },
  {
    key: 'admin.courierAnalytics.leaderboard.subtitle',
    en: 'Official all-time ranking from the analytics engine.',
    nl: 'Officiële all-time rangschikking van de analyse-engine.',
  },
  {
    key: 'admin.courierAnalytics.leaderboard.caption',
    en: 'Ranked courier reliability table',
    nl: 'Gerangschikte tabel met betrouwbaarheid van bezorgers',
  },
  {
    key: 'admin.courierAnalytics.column.rank',
    en: 'Rank',
    nl: 'Rang',
  },
  {
    key: 'admin.courierAnalytics.column.courier',
    en: 'Courier',
    nl: 'Bezorger',
  },
  {
    key: 'admin.courierAnalytics.column.completedRoutes',
    en: 'Completed routes',
    nl: 'Afgeronde routes',
  },
  {
    key: 'admin.courierAnalytics.column.deliveredStops',
    en: 'Delivered stops',
    nl: 'Bezorgde stops',
  },
  {
    key: 'admin.courierAnalytics.column.onTimeRate',
    en: 'On-time rate',
    nl: 'Op-tijd-percentage',
  },
  {
    key: 'admin.courierAnalytics.column.qrProofRate',
    en: 'QR proof rate',
    nl: 'QR-bewijspercentage',
  },
  {
    key: 'admin.courierAnalytics.column.dataCompleteness',
    en: 'Data completeness',
    nl: 'Volledigheid gegevens',
  },
  {
    key: 'admin.courierAnalytics.column.assignedRoutes',
    en: 'Assigned routes',
    nl: 'Toegewezen routes',
  },
  {
    key: 'admin.courierAnalytics.column.overdueRoutes',
    en: 'Overdue routes',
    nl: 'Achterstallige routes',
  },
  {
    key: 'admin.courierAnalytics.column.month',
    en: 'Month',
    nl: 'Maand',
  },
  {
    key: 'admin.courierAnalytics.component.routeCompletion',
    en: 'Route completion',
    nl: 'Routevoltooiing',
  },
  {
    key: 'admin.courierAnalytics.component.deliveryCompletion',
    en: 'Delivery completion',
    nl: 'Leveringsvoltooiing',
  },
  {
    key: 'admin.courierAnalytics.component.onTime',
    en: 'On-time delivery',
    nl: 'Levering op tijd',
  },
  {
    key: 'admin.courierAnalytics.component.qrConfirmation',
    en: 'QR confirmation',
    nl: 'QR-bevestiging',
  },
  {
    key: 'admin.courierAnalytics.component.consistency',
    en: 'Operational consistency',
    nl: 'Operationele consistentie',
  },
  {
    key: 'admin.courierAnalytics.series.deliveredStops',
    en: 'Delivered stops',
    nl: 'Bezorgde stops',
  },
  {
    key: 'admin.courierAnalytics.series.completedRoutes',
    en: 'Completed routes',
    nl: 'Afgeronde routes',
  },
  {
    key: 'admin.courierAnalytics.series.deliveredOrders',
    en: 'Delivered orders',
    nl: 'Bezorgde bestellingen',
  },
  {
    key: 'admin.courierAnalytics.charts.scoreComparison.title',
    en: 'Courier score comparison',
    nl: 'Scorevergelijking bezorgers',
  },
  {
    key: 'admin.courierAnalytics.charts.scoreComparison.subtitle',
    en: 'Which couriers have the highest overall reliability score?',
    nl: 'Welke bezorgers hebben de hoogste betrouwbaarheidsscore?',
  },
  {
    key: 'admin.courierAnalytics.charts.scoreComparison.caption',
    en: 'Scores are 0–100. Order matches the official ranking.',
    nl: 'Scores zijn 0–100. Volgorde volgt de officiële rangschikking.',
  },
  {
    key: 'admin.courierAnalytics.charts.scoreComparison.excludedNote',
    en: '{count} courier(s) with insufficient data are excluded from this chart.',
    nl: '{count} bezorger(s) met onvoldoende gegevens zijn uitgesloten van deze grafiek.',
  },
  {
    key: 'admin.courierAnalytics.charts.components.title',
    en: 'Reliability component comparison',
    nl: 'Vergelijking betrouwbaarheidscomponenten',
  },
  {
    key: 'admin.courierAnalytics.charts.components.subtitle',
    en: 'Which score components cause the ranking differences?',
    nl: 'Welke scorecomponenten veroorzaken de rangverschillen?',
  },
  {
    key: 'admin.courierAnalytics.charts.components.caption',
    en: 'Each bar is a 0–100 component score. Tooltips show weighted contributions.',
    nl: 'Elke balk is een componentscore van 0–100. Tooltips tonen gewogen bijdragen.',
  },
  {
    key: 'admin.courierAnalytics.charts.monthlyActivity.title',
    en: 'Monthly delivery activity',
    nl: 'Maandelijkse bezorgactiviteit',
  },
  {
    key: 'admin.courierAnalytics.charts.monthlyActivity.subtitle',
    en: 'How has delivery activity changed over the lifetime of the system?',
    nl: 'Hoe is de bezorgactiviteit veranderd over de levensduur van het systeem?',
  },
  {
    key: 'admin.courierAnalytics.charts.monthlyActivity.caption',
    en: 'Vaccine quantity is omitted from the chart to avoid distorting the activity scale.',
    nl: 'Vaccinhoeveelheid is weggelaten om de activiteitsschaal niet te verstoren.',
  },
  {
    key: 'admin.courierAnalytics.charts.routeStatus.title',
    en: 'Route status',
    nl: 'Routestatus',
  },
  {
    key: 'admin.courierAnalytics.charts.routeStatus.subtitle',
    en: 'Where do routes land in the operational status mix?',
    nl: 'Hoe verdelen routes zich over de operationele statussen?',
  },
  {
    key: 'admin.courierAnalytics.charts.timeliness.title',
    en: 'Delivery timeliness',
    nl: 'Tijdigheid van levering',
  },
  {
    key: 'admin.courierAnalytics.charts.timeliness.subtitle',
    en: 'On-time vs late vs unknown delivery dates.',
    nl: 'Op tijd versus te laat versus onbekende leveringsdata.',
  },
  {
    key: 'admin.courierAnalytics.charts.proof.title',
    en: 'Proof method',
    nl: 'Bewijsmethode',
  },
  {
    key: 'admin.courierAnalytics.charts.proof.subtitle',
    en: 'How deliveries were confirmed.',
    nl: 'Hoe leveringen zijn bevestigd.',
  },
  {
    key: 'admin.courierAnalytics.charts.handling.title',
    en: 'Stop handling time',
    nl: 'Afhandeltijd per stop',
  },
  {
    key: 'admin.courierAnalytics.charts.handling.subtitle',
    en: 'Which couriers spend the least or most time between recorded arrival and confirmed delivery?',
    nl: 'Welke bezorgers besteden de minste of meeste tijd tussen geregistreerde aankomst en bevestigde levering?',
  },
  {
    key: 'admin.courierAnalytics.charts.handling.emptyTitle',
    en: 'No handling duration samples',
    nl: 'Geen afhandeltijdsteekproeven',
  },
  {
    key: 'admin.courierAnalytics.charts.handling.emptyDescription',
    en: 'Couriers need recorded arrival and delivery timestamps for this chart.',
    nl: 'Bezorgers hebben geregistreerde aankomst- en leveringstijdstempels nodig voor deze grafiek.',
  },
  {
    key: 'admin.courierAnalytics.charts.empty.title',
    en: 'No chart data',
    nl: 'Geen grafiekgegevens',
  },
  {
    key: 'admin.courierAnalytics.charts.empty.description',
    en: 'There is not enough historical activity to draw this chart.',
    nl: 'Er is onvoldoende historische activiteit om deze grafiek te tekenen.',
  },
  {
    key: 'admin.courierAnalytics.routeStatus.assigned',
    en: 'Assigned',
    nl: 'Toegewezen',
  },
  {
    key: 'admin.courierAnalytics.routeStatus.inProgress',
    en: 'In progress',
    nl: 'Bezig',
  },
  {
    key: 'admin.courierAnalytics.routeStatus.completed',
    en: 'Completed',
    nl: 'Afgerond',
  },
  {
    key: 'admin.courierAnalytics.routeStatus.cancelled',
    en: 'Cancelled',
    nl: 'Geannuleerd',
  },
  {
    key: 'admin.courierAnalytics.routeStatus.overdueIncomplete',
    en: 'Overdue incomplete',
    nl: 'Achterstallig onvoltooid',
  },
  {
    key: 'admin.courierAnalytics.timeliness.onTime',
    en: 'On time',
    nl: 'Op tijd',
  },
  {
    key: 'admin.courierAnalytics.timeliness.late',
    en: 'Late',
    nl: 'Te laat',
  },
  {
    key: 'admin.courierAnalytics.timeliness.unknown',
    en: 'Unknown',
    nl: 'Onbekend',
  },
  {
    key: 'admin.courierAnalytics.proof.qr',
    en: 'QR',
    nl: 'QR',
  },
  {
    key: 'admin.courierAnalytics.proof.admin',
    en: 'Admin',
    nl: 'Admin',
  },
  {
    key: 'admin.courierAnalytics.proof.unknown',
    en: 'Unknown',
    nl: 'Onbekend',
  },
  {
    key: 'admin.courierAnalytics.detail.title',
    en: 'Courier detail',
    nl: 'Bezorgerdetail',
  },
  {
    key: 'admin.courierAnalytics.detail.rawMetrics',
    en: 'Raw metrics',
    nl: 'Ruwe meetwaarden',
  },
  {
    key: 'admin.courierAnalytics.detail.routeMetrics',
    en: 'Route metrics',
    nl: 'Routemeetwaarden',
  },
  {
    key: 'admin.courierAnalytics.detail.stopMetrics',
    en: 'Stop metrics',
    nl: 'Stopmeetwaarden',
  },
  {
    key: 'admin.courierAnalytics.detail.onTimeStops',
    en: 'On-time stops',
    nl: 'Stops op tijd',
  },
  {
    key: 'admin.courierAnalytics.detail.lateStops',
    en: 'Late stops',
    nl: 'Te late stops',
  },
  {
    key: 'admin.courierAnalytics.detail.qrConfirmedStops',
    en: 'QR-confirmed stops',
    nl: 'QR-bevestigde stops',
  },
  {
    key: 'admin.courierAnalytics.consistency.overdueIncomplete',
    en: 'Overdue incomplete routes',
    nl: 'Achterstallige onvoltooide routes',
  },
  {
    key: 'admin.courierAnalytics.consistency.abandonedProcessing',
    en: 'Abandoned processing confirmations',
    nl: 'Afgebroken verwerkingsbevestigingen',
  },
  {
    key: 'admin.courierAnalytics.consistency.invalidProofs',
    en: 'Invalid or incomplete proofs',
    nl: 'Ongeldige of onvolledige bewijzen',
  },
  {
    key: 'admin.courierAnalytics.consistency.explanation',
    en: 'Consistency issues reduce the operational consistency component. Cancelled routes and unrelated system failures are not counted.',
    nl: 'Consistentieproblemen verlagen de component operationele consistentie. Geannuleerde routes en niet-gerelateerde systeemfouten tellen niet mee.',
  },
  {
    key: 'admin.courierAnalytics.detailTable.title',
    en: 'Detailed values',
    nl: 'Gedetailleerde waarden',
  },
  {
    key: 'admin.courierAnalytics.detailTable.subtitle',
    en: 'Exact backend values for auditability.',
    nl: 'Exacte backendwaarden voor controleerbaarheid.',
  },
  {
    key: 'admin.courierAnalytics.detailTable.caption',
    en: 'Full courier analytics detail table',
    nl: 'Volledige detailtabel bezorgeranalyse',
  },
  {
    key: 'admin.courierAnalytics.dataQuality.title',
    en: 'Data quality',
    nl: 'Gegevenskwaliteit',
  },
  {
    key: 'admin.courierAnalytics.dataQuality.summary',
    en: 'Bounded diagnostics for legacy or incomplete historical records.',
    nl: 'Begrensde diagnostiek voor legacy of onvolledige historische records.',
  },
  {
    key: 'admin.courierAnalytics.dataQuality.legacyRoutes',
    en: 'Legacy routes missing fields',
    nl: 'Legacy-routes met ontbrekende velden',
  },
  {
    key: 'admin.courierAnalytics.dataQuality.missingTimestamps',
    en: 'Delivered stops without timestamps',
    nl: 'Bezorgde stops zonder tijdstempels',
  },
  {
    key: 'admin.courierAnalytics.dataQuality.invalidSequences',
    en: 'Invalid stop sequences',
    nl: 'Ongeldige stopvolgordes',
  },
  {
    key: 'admin.courierAnalytics.dataQuality.missingOrders',
    en: 'Missing orders',
    nl: 'Ontbrekende bestellingen',
  },
  {
    key: 'admin.courierAnalytics.dataQuality.invalidHandling',
    en: 'Invalid handling durations',
    nl: 'Ongeldige afhandeltijden',
  },
  {
    key: 'admin.courierAnalytics.dataQuality.malformedProofs',
    en: 'Malformed proofs',
    nl: 'Misvormde bewijzen',
  },
  {
    key: 'admin.courierAnalytics.dataQuality.exclusionNote',
    en: 'Affected records may be excluded from specific calculations. Raw record IDs are not shown.',
    nl: 'Getroffen records kunnen uit specifieke berekeningen worden uitgesloten. Ruwe record-ID’s worden niet getoond.',
  },
  {
    key: 'admin.courierAnalytics.noData.title',
    en: 'No analytics available',
    nl: 'Geen analyse beschikbaar',
  },
  {
    key: 'admin.courierAnalytics.noData.description',
    en: 'Rankings require historical assigned or completed courier work. Summary diagnostics may still appear when available.',
    nl: 'Rangschikkingen vereisen historisch toegewezen of afgerond bezorgwerk. Samenvattende diagnostiek kan nog verschijnen wanneer beschikbaar.',
  },
  {
    key: 'admin.courierAnalytics.error.title',
    en: 'Unable to load analytics',
    nl: 'Analyse laden mislukt',
  },
  {
    key: 'admin.courierAnalytics.error.loadFailed',
    en: 'Courier performance analytics could not be loaded.',
    nl: 'Prestatieanalyse van bezorgers kon niet worden geladen.',
  },
  {
    key: 'admin.courierAnalytics.export.success',
    en: 'CSV export downloaded.',
    nl: 'CSV-export gedownload.',
  },
  {
    key: 'admin.courierAnalytics.export.error.forbidden',
    en: 'You are not allowed to export courier analytics.',
    nl: 'Je mag bezorgeranalyse niet exporteren.',
  },
  {
    key: 'admin.courierAnalytics.export.error.network',
    en: 'Network error while exporting CSV.',
    nl: 'Netwerkfout bij CSV-export.',
  },
  {
    key: 'admin.courierAnalytics.export.error.invalid',
    en: 'The server returned an unexpected file type.',
    nl: 'De server gaf een onverwacht bestandstype terug.',
  },
  {
    key: 'admin.courierAnalytics.export.error.failed',
    en: 'CSV export failed.',
    nl: 'CSV-export mislukt.',
  },
] as const
