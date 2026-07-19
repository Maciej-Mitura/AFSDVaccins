type ZonedDateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

export type IsoWeekYear = {
  isoWeek: number
  isoYear: number
}

export function getZonedDateParts(
  instant: Date,
  timeZone: string,
): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(instant)
  const lookup = Object.fromEntries(
    parts
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value]),
  )

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
  }
}

export function parseClosingTime(closingTime: string): {
  hour: number
  minute: number
} {
  const match = /^(\d{2}):(\d{2})$/.exec(closingTime)

  if (!match) {
    throw new Error(`Invalid closing time format: ${closingTime}`)
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  }
}

export function isAtOrAfterClosingTime(
  instant: Date,
  timeZone: string,
  closingTime: string,
): boolean {
  const local = getZonedDateParts(instant, timeZone)
  const closing = parseClosingTime(closingTime)

  if (local.hour !== closing.hour) {
    return local.hour > closing.hour
  }

  return local.minute >= closing.minute
}

export function formatLocalDate(parts: ZonedDateParts): string {
  const month = String(parts.month).padStart(2, '0')
  const day = String(parts.day).padStart(2, '0')
  return `${parts.year}-${month}-${day}`
}

export function addLocalDays(
  parts: ZonedDateParts,
  days: number,
): ZonedDateParts {
  const utcDate = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  )

  return {
    year: utcDate.getUTCFullYear(),
    month: utcDate.getUTCMonth() + 1,
    day: utcDate.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
  }
}

export function resolveDeliveryDate(
  instant: Date,
  timeZone: string,
  closingTime: string,
): string {
  const local = getZonedDateParts(instant, timeZone)

  if (isAtOrAfterClosingTime(instant, timeZone, closingTime)) {
    return formatLocalDate(addLocalDays(local, 1))
  }

  return formatLocalDate(local)
}

/** Local calendar date (YYYY-MM-DD) for `instant` in `timeZone`. */
export function getLocalCalendarDate(
  instant: Date,
  timeZone: string,
): string {
  return formatLocalDate(getZonedDateParts(instant, timeZone))
}

/** Tomorrow’s local calendar date (YYYY-MM-DD) relative to `instant` in `timeZone`. */
export function getLocalTomorrowDate(
  instant: Date,
  timeZone: string,
): string {
  return formatLocalDate(
    addLocalDays(getZonedDateParts(instant, timeZone), 1),
  )
}

export function getIsoWeekYearForDeliveryDate(
  deliveryDate: string,
): IsoWeekYear {
  const [year, month, day] = deliveryDate.split('-').map(Number)
  const utcThursday = new Date(Date.UTC(year, month - 1, day))
  const dayOfWeek = utcThursday.getUTCDay() || 7
  utcThursday.setUTCDate(utcThursday.getUTCDate() + 4 - dayOfWeek)

  const isoYear = utcThursday.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const isoWeek = Math.ceil(
    ((utcThursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  )

  return { isoWeek, isoYear }
}

export function getIsoWeekYear(instant: Date, timeZone: string): IsoWeekYear {
  const localDate = formatLocalDate(getZonedDateParts(instant, timeZone))
  return getIsoWeekYearForDeliveryDate(localDate)
}
