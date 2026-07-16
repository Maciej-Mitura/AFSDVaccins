import { registerEnumType } from '@nestjs/graphql'

export enum RouteStatus {
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

registerEnumType(RouteStatus, {
  name: 'RouteStatus',
  description: 'Delivery route lifecycle status',
})
