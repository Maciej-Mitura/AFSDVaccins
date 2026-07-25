/**
 * Phase 26D courier QR confirmation bounds.
 * Token max length matches preview so the same wire tokens are accepted.
 */
export const DELIVERY_QR_CONFIRM_TOKEN_MAX_LENGTH = 2048

/** Cleared bearer material after successful consume (inactive; never re-issued). */
export const DELIVERY_QR_CONSUMED_ENCODED_TOKEN_PLACEHOLDER = ''

/**
 * Stale PROCESSING claims older than this may be reclaimed by the assigned
 * courier (keeps the same confirmationEventId for order provenance).
 */
export const DELIVERY_QR_CONFIRM_STALE_CLAIM_MS = 60_000
