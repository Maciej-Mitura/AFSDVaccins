/**
 * Safe download filenames — no pharmacy names, tokens, or user ids.
 */

export function buildRouteManifestFilename(
  routeDate: string,
  routeId: string,
): string {
  const safeDate = safeIsoDate(routeDate)
  const shortId = shortRouteId(routeId)
  return `delivery-manifest-${safeDate}-route-${shortId}.pdf`
}

export function buildStopManifestFilename(
  routeDate: string,
  routeId: string,
  stopSequence: number,
): string {
  const safeDate = safeIsoDate(routeDate)
  const shortId = shortRouteId(routeId)
  const sequence =
    typeof stopSequence === 'number' && Number.isFinite(stopSequence)
      ? Math.trunc(stopSequence)
      : 0
  return `delivery-manifest-${safeDate}-route-${shortId}-stop-${sequence}.pdf`
}

function safeIsoDate(routeDate: string): string {
  return typeof routeDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(routeDate)
    ? routeDate
    : 'unknown-date'
}

function shortRouteId(routeId: string): string {
  const trimmed =
    typeof routeId === 'string' ? routeId.replace(/[^a-fA-F0-9]/g, '') : ''
  if (trimmed.length >= 8) {
    return trimmed.slice(-8).toLowerCase()
  }
  if (trimmed.length > 0) {
    return trimmed.toLowerCase()
  }
  return 'unknown'
}
