import { registerEnumType } from '@nestjs/graphql'

/**
 * Persisted notification categories.
 * Legacy order/stock types coexist with Phase 27A role-event taxonomy.
 */
export enum NotificationType {
  ORDER_CONFIRMATION = 'ORDER_CONFIRMATION',
  WEEK_LIMIT_WARNING = 'WEEK_LIMIT_WARNING',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  ORDER_DELIVERED = 'ORDER_DELIVERED',
  LOW_STOCK_WARNING = 'LOW_STOCK_WARNING',
  APOTHEKER_ROUTE_STARTED = 'APOTHEKER_ROUTE_STARTED',
  APOTHEKER_NEXT_STOP = 'APOTHEKER_NEXT_STOP',
  APOTHEKER_DELIVERY_CONFIRMED = 'APOTHEKER_DELIVERY_CONFIRMED',
  BEZORGER_ROUTE_ASSIGNED = 'BEZORGER_ROUTE_ASSIGNED',
  BEZORGER_ROUTE_DATE_REMINDER = 'BEZORGER_ROUTE_DATE_REMINDER',
  ADMIN_NEW_ORDER = 'ADMIN_NEW_ORDER',
}

registerEnumType(NotificationType, {
  name: 'NotificationType',
  description:
    'Persisted notification categories for apotheker, bezorger and admin alerts',
})
