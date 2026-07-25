import { Field, ID, Int, ObjectType } from '@nestjs/graphql'

import { Address } from '../../profile/address.type'

/**
 * Safe pharmacy/admin QR metadata — never includes encodedToken, nonce, or hashes.
 */
@ObjectType('DeliveryStopQr')
export class DeliveryStopQr {
  @Field(() => ID)
  routeId!: string

  @Field(() => ID)
  stopId!: string

  @Field()
  routeDate!: string

  @Field()
  pharmacyName!: string

  @Field(() => Address)
  address!: Address

  @Field(() => Int)
  orderCount!: number

  @Field(() => [ID])
  orderIds!: string[]

  @Field(() => Boolean)
  qrAvailable!: boolean

  @Field(() => Boolean)
  qrConsumed!: boolean

  @Field(() => Date, { nullable: true })
  issuedAt!: Date | null

  /**
   * Relative authenticated path for the SVG render endpoint.
   * Present only when an active QR may still be retrieved.
   */
  @Field(() => String, { nullable: true })
  qrImagePath!: string | null
}
