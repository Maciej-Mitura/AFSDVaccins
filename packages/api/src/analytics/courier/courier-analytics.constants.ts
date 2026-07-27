/**
 * Phase 32A courier analytics operational constants.
 */

export const COURIER_ANALYTICS_CACHE_TTL_MS = 5 * 60 * 1000

/** Soft ceiling on historical routes loaded for one all-time analytics pass. */
export const COURIER_ANALYTICS_MAX_ROUTES = 25_000

/** Soft ceiling on ranked courier rows returned / exported. */
export const COURIER_ANALYTICS_MAX_COURIERS = 2_000

export const COURIER_ANALYTICS_CSV_CONTENT_TYPE = 'text/csv; charset=utf-8'
export const COURIER_ANALYTICS_CSV_CACHE_CONTROL = 'private, no-store'
export const COURIER_ANALYTICS_CSV_FILENAME =
  'courier-performance-all-time.csv'

export const COURIER_ANALYTICS_CSV_HEADERS = [
  'Rank',
  'Courier',
  'Reliability score',
  'Route completion score',
  'Delivery completion score',
  'On-time score',
  'QR confirmation score',
  'Operational consistency score',
  'Assigned routes',
  'Completed routes',
  'Overdue incomplete routes',
  'Delivered stops',
  'On-time stops',
  'Late stops',
  'QR-confirmed stops',
  'Average stop handling duration',
  'Consistency issue count',
] as const

export function buildCourierAnalyticsExportPath(): string {
  return '/analytics/couriers/export.csv'
}

/** Presentation rounding for scores (calculation stays full precision). */
export const COURIER_ANALYTICS_SCORE_DECIMALS = 2
