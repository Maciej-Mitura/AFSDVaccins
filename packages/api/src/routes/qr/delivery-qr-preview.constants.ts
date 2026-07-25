/**
 * Phase 26C courier scan-preview bounds.
 * Wire tokens are small (base64url JSON + HMAC); oversized bodies are rejected early.
 */
export const DELIVERY_QR_PREVIEW_TOKEN_MAX_LENGTH = 2048

/** Order statuses that may appear on an in-progress delivery stop. */
export const DELIVERY_QR_PREVIEW_DELIVERABLE_ORDER_STATUSES = [
  'PENDING',
  'PLANNED',
] as const
