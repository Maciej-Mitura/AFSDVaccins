import { Field, ID, Int, ObjectType } from '@nestjs/graphql'
import { Column } from 'typeorm'

import { Address } from '../profile/address.type'
import { OrderLineSnapshot } from './order-line-snapshot.embed'
import { StopConfirmationProcess } from './qr/stop-confirmation-process.embed'
import { StopDeliveryProof } from './qr/stop-delivery-proof.embed'
import { StopQrConfirmation } from './qr/stop-qr-confirmation.embed'


@ObjectType('DeliveryStop')
export class DeliveryStop {
  /**
   * Stable identifier for this generated stop (token claim). Not present on
   * legacy pre-26A routes.
   */
  @Column()
  @Field(() => ID, { nullable: true })
  stopId?: string

  @Column()
  @Field(() => Int)
  sequence!: number

  @Column()
  @Field(() => ID)
  apothekerProfileId!: string

  @Column()
  @Field(() => ID)
  apothekerUserId!: string

  @Column()
  @Field()
  pharmacyName!: string

  @Column()
  @Field(() => Address)
  address!: Address

  @Column()
  @Field(() => [ID])
  orderIds!: string[]

  @Column()
  @Field(() => Int)
  orderCount!: number

  @Column()
  @Field(() => Int)
  totalQuantity!: number

  @Column()
  @Field(() => [OrderLineSnapshot])
  lines!: OrderLineSnapshot[]

  /**
   * Persistence-only QR confirmation (nonce hash + consume metadata).
   * Never expose via GraphQL — use qrAvailable / qrConsumed ResolveFields.
   */
  @Column({ nullable: true })
  qrConfirmation?: StopQrConfirmation | null

  /**
   * Persistence-only delivery proof after successful QR confirmation.
   * Never expose the full object via GraphQL — use deliveredAt ResolveField.
   * Written only when confirmationProcess reaches COMPLETED.
   */
  @Column({ nullable: true })
  deliveryProof?: StopDeliveryProof | null

  /**
   * Persistence-only in-flight / completed confirmation process (Phase 26D).
   * Never GraphQL-exposed. PROCESSING keeps the QR token verifiable for resume.
   */
  @Column({ nullable: true })
  confirmationProcess?: StopConfirmationProcess | null
}
