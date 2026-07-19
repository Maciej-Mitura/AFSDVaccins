import {
  isAtOrAfterClosingTime,
} from '../order/delivery-date.util'
import { Order } from '../order/order.entity'

/**
 * Phase 13 / RULE-013 preview-only gate.
 * Does not alter Phase 7 placement or Phase 12 generation.
 *
 * Post-closing submissions are excluded even when deliveryDate === tomorrow.
 * Exactly at closing matches Phase 7 (`isAtOrAfterClosingTime`) → excluded.
 */
export function isOrderEligibleForTomorrowPreview(
  order: Pick<Order, 'submittedAt'>,
  timeZone: string,
  orderingClosingTime: string,
): boolean {
  return !isAtOrAfterClosingTime(
    order.submittedAt,
    timeZone,
    orderingClosingTime,
  )
}

export function filterOrdersForTomorrowPreview(
  orders: Order[],
  timeZone: string,
  orderingClosingTime: string,
): Order[] {
  return orders.filter(order =>
    isOrderEligibleForTomorrowPreview(
      order,
      timeZone,
      orderingClosingTime,
    ),
  )
}
