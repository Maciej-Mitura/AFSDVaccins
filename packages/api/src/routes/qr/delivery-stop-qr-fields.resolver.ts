import { Parent, ResolveField, Resolver } from '@nestjs/graphql'

import { DeliveryStop } from '../delivery-stop.embed'
import {
  getStopDeliveredAt,
  isStopQrAvailable,
  isStopQrConsumed,
} from './stop-qr-invariants'

/**
 * Safe QR readiness fields only — never nonce, nonceHash, encodedToken, or signing claims.
 */
@Resolver(() => DeliveryStop)
export class DeliveryStopQrFieldsResolver {
  @ResolveField(() => Boolean, {
    description:
      'True when this generated stop has unconsumed QR confirmation metadata.',
  })
  qrAvailable(@Parent() stop: DeliveryStop): boolean {
    return isStopQrAvailable(stop)
  }

  @ResolveField(() => Boolean, {
    description:
      'True when this stop’s QR confirmation has been consumed after delivery.',
  })
  qrConsumed(@Parent() stop: DeliveryStop): boolean {
    return isStopQrConsumed(stop)
  }

  @ResolveField(() => Date, {
    nullable: true,
    description:
      'Delivery timestamp from stop delivery proof, when confirmation succeeded.',
  })
  deliveredAt(@Parent() stop: DeliveryStop): Date | null {
    return getStopDeliveredAt(stop)
  }
}
