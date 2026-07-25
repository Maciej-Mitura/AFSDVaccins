import { Column } from 'typeorm'

import { DeliveryProofMethod } from './delivery-proof-method.enum'

/**
 * Proof recorded when a generated stop is successfully confirmed delivered.
 * Must not exist before a successful QR confirmation consume (Phase 26C+).
 *
 * Persistence-only in Phase 26A. `deliveredAt` is mirrored via a safe ResolveField.
 * `recipientCity` is retained for later coarse-location notifications (Phase 28+).
 */
export class StopDeliveryProof {
  @Column()
  method!: DeliveryProofMethod

  @Column()
  deliveredAt!: Date

  @Column()
  deliveredByUserId!: string

  /** Order IDs that belonged to the stop at confirmation time (must ⊆ stop.orderIds). */
  @Column()
  associatedOrderIds!: string[]

  @Column()
  recipientProfileId!: string

  /** Snapshotted pharmacy city for later coarse notifications — not live geolocation. */
  @Column()
  recipientCity!: string

  /** Optional correlation id linking confirmation/event rows (Phase 26C+). */
  @Column({ nullable: true })
  confirmationEventId?: string | null
}
