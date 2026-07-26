/**
 * Local calendar date in Europe/Brussels as YYYY-MM-DD.
 * Route business dates use this zone; cache keys store the server deliveryDate.
 */
export function brusselsCalendarDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const year = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  const day = parts.find(part => part.type === 'day')?.value

  if (!year || !month || !day) {
    const fallbackYear = now.getFullYear()
    const fallbackMonth = String(now.getMonth() + 1).padStart(2, '0')
    const fallbackDay = String(now.getDate()).padStart(2, '0')
    return `${fallbackYear}-${fallbackMonth}-${fallbackDay}`
  }

  return `${year}-${month}-${day}`
}
