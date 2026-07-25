import { Column } from 'typeorm'

/**
 * Per-stop QR confirmation metadata on a generated {@link DeliveryRoute} stop.
 * Never stored on {@link RouteTemplate} stops.
 *
 * Persistence-only: never GraphQL-exposed as an object. Safe readiness is exposed
 * via DeliveryStop ResolveFields (`qrAvailable` / `qrConsumed`).
 *
 * Lifecycle (Phase 26A foundation; consume in 26C+):
 * - Generation: create plaintext nonce → persist `nonceHash` + mint `encodedToken`
 *   → discard plaintext nonce (never stored separately).
 * - Scan/preview (26B): does **not** consume or clear `encodedToken`.
 * - Successful delivery confirmation (26C): marks consumed; validation rejects
 *   consumed stops even if an old QR image still exists.
 * - After consumption, authorised token retrieval must not return an active QR.
 * - Whether `encodedToken` is cleared after consume may be deferred to Phase 26D;
 *   intended policy: treat consumed confirmation as inactive regardless, and
 *   prefer clearing/rotating the bearer material when the consume path lands.
 *
 * `encodedToken` is a bearer credential — never log, never put in PubSub/audit,
 * never expose on ordinary DeliveryRoute/DeliveryStop GraphQL fields.
 */
export class StopQrConfirmation {
  /** Token format version that was current when this confirmation was issued. */
  @Column()
  tokenVersion!: number

  /** SHA-256 hex digest of the cryptographically random nonce (never plaintext). */
  @Column()
  nonceHash!: string

  /**
   * HMAC-signed version-1 token (bearer). Persistence-only.
   * Minted at route generation so QR encoding (26B) does not need the plaintext nonce.
   */
  @Column()
  encodedToken!: string

  @Column()
  issuedAt!: Date

  /** Set together with consumedByUserId only after successful delivery confirmation. */
  @Column({ nullable: true })
  consumedAt?: Date | null

  /** Set together with consumedAt only after successful delivery confirmation. */
  @Column({ nullable: true })
  consumedByUserId?: string | null
}
