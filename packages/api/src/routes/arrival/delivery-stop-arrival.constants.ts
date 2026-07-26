/** Max ISO-8601 clientArrivedAt / idempotencyKey string length. */
export const DELIVERY_ARRIVAL_CLIENT_ARRIVED_AT_MAX_LENGTH = 64
export const DELIVERY_ARRIVAL_IDEMPOTENCY_KEY_MAX_LENGTH = 128
export const DELIVERY_ARRIVAL_IDEMPOTENCY_KEY_MIN_LENGTH = 8

/** Reject client timestamps more than this far in the future. */
export const DELIVERY_ARRIVAL_FUTURE_SKEW_MS = 5 * 60 * 1000

/**
 * Reject client timestamps earlier than (route business date start in
 * Europe/Brussels) minus this window.
 */
export const DELIVERY_ARRIVAL_MAX_AGE_BEFORE_ROUTE_DATE_MS = 24 * 60 * 60 * 1000

export const DELIVERY_ARRIVAL_TIME_ZONE = 'Europe/Brussels'

export const DELIVERY_ARRIVAL_STATUS_RECORDED = 'RECORDED' as const
