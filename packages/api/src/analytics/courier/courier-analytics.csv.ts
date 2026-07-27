import {
  COURIER_ANALYTICS_CSV_FILENAME,
  COURIER_ANALYTICS_CSV_HEADERS,
} from './courier-analytics.constants'
import type { CourierPerformanceAnalyticsResult } from './courier-analytics.types'

/**
 * Build UTF-8 CSV for courier rankings.
 * Escapes RFC4180 fields and neutralises spreadsheet formula injection.
 */
export function buildCourierAnalyticsCsv(
  result: CourierPerformanceAnalyticsResult,
): { csv: string; filename: string; rowCount: number } {
  const lines: string[] = [COURIER_ANALYTICS_CSV_HEADERS.map(escapeCsvCell).join(',')]

  for (const row of result.courierRankings) {
    const cells = [
      String(row.rank),
      row.displayName,
      formatNumber(row.totalScore),
      formatNumber(row.componentScores.routeCompletion),
      formatNumber(row.componentScores.deliveryCompletion),
      formatNumber(row.componentScores.onTime),
      formatNumber(row.componentScores.qrConfirmation),
      formatNumber(row.componentScores.operationalConsistency),
      String(row.rawMetrics.totalAssignedRoutes),
      String(row.rawMetrics.completedRoutes),
      String(row.rawMetrics.incompleteRoutes),
      String(row.rawMetrics.deliveredStops),
      String(row.rawMetrics.onTimeDeliveredStops),
      String(row.rawMetrics.lateDeliveredStops),
      String(row.rawMetrics.qrConfirmedStops),
      formatOptionalNumber(row.rawMetrics.averageHandlingDurationSeconds),
      String(row.rawMetrics.consistencyIssueCount),
    ]
    lines.push(cells.map(escapeCsvCell).join(','))
  }

  // UTF-8 BOM helps Excel recognise encoding.
  const csv = `\uFEFF${lines.join('\r\n')}\r\n`

  return {
    csv,
    filename: COURIER_ANALYTICS_CSV_FILENAME,
    rowCount: result.courierRankings.length,
  }
}

export function escapeCsvCell(value: string): string {
  const neutralized = neutralizeCsvInjection(value)
  if (/[",\r\n]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`
  }
  return neutralized
}

/**
 * Prefix formula-like values so spreadsheet apps do not execute them.
 */
export function neutralizeCsvInjection(value: string): string {
  if (value.length === 0) {
    return value
  }
  const first = value[0]
  if (first === '=' || first === '+' || first === '-' || first === '@') {
    return `'${value}`
  }
  // Also guard tab/CR-prefixed formula payloads used by some spreadsheet apps.
  if (first === '\t' || first === '\r') {
    return `'${value}`
  }
  return value
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : ''
}

function formatOptionalNumber(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return ''
  }
  return String(Math.round(value * 100) / 100)
}
