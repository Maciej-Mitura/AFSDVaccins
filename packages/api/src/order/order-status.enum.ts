import { registerEnumType } from '@nestjs/graphql'

export enum OrderStatus {
  PENDING = 'PENDING',
  PLANNED = 'PLANNED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

registerEnumType(OrderStatus, {
  name: 'OrderStatus',
  description: 'Lifecycle status of a vaccine order',
})
