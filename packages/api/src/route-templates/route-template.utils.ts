/**
 * Trim, collapse internal whitespace, and case-fold for uniqueness checks.
 * Display `name` remains separately trimmed (whitespace preserved as entered).
 */
export function normalizeRouteTemplateName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function orderStopsBySequence<T extends { sequence: number }>(
  stops: T[],
): T[] {
  return [...stops].sort((a, b) => a.sequence - b.sequence)
}
