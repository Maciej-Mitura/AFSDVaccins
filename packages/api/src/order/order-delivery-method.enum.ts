/**
 * How an order reached DELIVERED.
 * Persistence-only (not GraphQL) — used for QR confirmation provenance.
 */
export enum OrderDeliveryMethod {
  /** Marked delivered by ADMIN GraphQL status update. */
  ADMIN = 'ADMIN',
  /** Marked delivered by courier QR confirmation (Phase 26D). */
  QR = 'QR',
}
