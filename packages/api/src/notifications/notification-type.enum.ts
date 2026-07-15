import { registerEnumType } from '@nestjs/graphql'

export enum NotificationType {
  ORDER_CONFIRMATION = 'ORDER_CONFIRMATION',
  WEEK_LIMIT_WARNING = 'WEEK_LIMIT_WARNING',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
}

registerEnumType(NotificationType, {
  name: 'NotificationType',
  description: 'Persisted notification categories for Phase 8 apotheker alerts',
})
