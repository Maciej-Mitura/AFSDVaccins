import {
  DELIVERY_ARRIVAL_CLIENT_ARRIVED_AT_MAX_LENGTH,
  DELIVERY_ARRIVAL_FUTURE_SKEW_MS,
  DELIVERY_ARRIVAL_IDEMPOTENCY_KEY_MAX_LENGTH,
  DELIVERY_ARRIVAL_IDEMPOTENCY_KEY_MIN_LENGTH,
  DELIVERY_ARRIVAL_MAX_AGE_BEFORE_ROUTE_DATE_MS,
  DELIVERY_ARRIVAL_TIME_ZONE,
} from './delivery-stop-arrival.constants'
import {
  DeliveryArrivalIdempotencyKeyInvalidException,
  DeliveryArrivalTimestampInvalidException,
} from './delivery-stop-arrival.exceptions'

/**
 * Parse route business date (YYYY-MM-DD) as the start of that calendar day in
 * Europe/Brussels, expressed as a UTC instant.
 */
export function brusselsRouteDateStartUtc(routeDate: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(routeDate)) {
    return null
  }

  const [year, month, day] = routeDate.split('-').map(Number)
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null
  }

  // Probe midday UTC then adjust to local midnight via offset.
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: DELIVERY_ARRIVAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(
    formatter
      .formatToParts(probe)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value]),
  )

  const localAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  const offsetMs = localAsUtc - probe.getTime()
  const localMidnightAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs
  const result = new Date(localMidnightAsUtc)

  if (Number.isNaN(result.getTime())) {
    return null
  }
  return result
}

export function parseClientArrivedAt(
  raw: unknown,
  options: { routeDate: string; now?: Date },
): Date {
  if (typeof raw !== 'string') {
    throw new DeliveryArrivalTimestampInvalidException()
  }

  const trimmed = raw.trim()
  if (
    trimmed.length === 0 ||
    trimmed.length > DELIVERY_ARRIVAL_CLIENT_ARRIVED_AT_MAX_LENGTH
  ) {
    throw new DeliveryArrivalTimestampInvalidException()
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    throw new DeliveryArrivalTimestampInvalidException()
  }

  // Require a real ISO-ish instant (reject bare dates without time ambiguity).
  if (!trimmed.includes('T') && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new DeliveryArrivalTimestampInvalidException()
  }

  const now = options.now ?? new Date()
  if (parsed.getTime() > now.getTime() + DELIVERY_ARRIVAL_FUTURE_SKEW_MS) {
    throw new DeliveryArrivalTimestampInvalidException()
  }

  const routeStart = brusselsRouteDateStartUtc(options.routeDate)
  if (!routeStart) {
    throw new DeliveryArrivalTimestampInvalidException()
  }

  const earliestAllowed =
    routeStart.getTime() - DELIVERY_ARRIVAL_MAX_AGE_BEFORE_ROUTE_DATE_MS
  if (parsed.getTime() < earliestAllowed) {
    throw new DeliveryArrivalTimestampInvalidException()
  }

  return parsed
}

export function parseIdempotencyKey(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new DeliveryArrivalIdempotencyKeyInvalidException()
  }

  const trimmed = raw.trim()
  if (
    trimmed.length < DELIVERY_ARRIVAL_IDEMPOTENCY_KEY_MIN_LENGTH ||
    trimmed.length > DELIVERY_ARRIVAL_IDEMPOTENCY_KEY_MAX_LENGTH
  ) {
    throw new DeliveryArrivalIdempotencyKeyInvalidException()
  }

  // Bound to printable non-whitespace (UUID / random tokens).
  if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
    throw new DeliveryArrivalIdempotencyKeyInvalidException()
  }

  return trimmed
}
