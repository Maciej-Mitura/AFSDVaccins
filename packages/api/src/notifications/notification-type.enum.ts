import { registerEnumType } from '@nestjs/graphql'

export enum NotificationType {
  ORDER_CONFIRMATION = 'ORDER_CONFIRMATION',
  WEEK_LIMIT_WARNING = 'WEEK_LIMIT_WARNING',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  ORDER_DELIVERED = 'ORDER_DELIVERED',
  LOW_STOCK_WARNING = 'LOW_STOCK_WARNING',
}

registerEnumType(NotificationType, {
  name: 'NotificationType',
  description: 'Persisted notification categories for apotheker and admin alerts',
})
