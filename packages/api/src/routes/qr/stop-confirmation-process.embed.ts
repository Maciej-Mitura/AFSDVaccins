import { Column } from 'typeorm'

/**
 * In-flight / completed QR confirmation process on a generated stop (Phase 26D).
 * Persistence-only — never GraphQL-exposed to the PWA.
 *
 * PROCESSING: stop claimed; orders may be partially delivered; QR token remains
 * verifiable for crash recovery / retry. Final deliveryProof and consume fields
 * are written only on COMPLETED.
 */
export enum StopConfirmationProcessState {
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
}

export class StopConfirmationProcess {
  @Column()
  state!: StopConfirmationProcessState

  /** Stable idempotency / audit correlation id for this confirmation attempt. */
  @Column()
  confirmationEventId!: string

  @Column()
  claimedAt!: Date

  @Column()
  claimedByUserId!: string

  @Column()
  lastUpdatedAt!: Date
}
