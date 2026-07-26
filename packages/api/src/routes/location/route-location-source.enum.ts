import { registerEnumType } from '@nestjs/graphql'

/**
 * Authoritative event that last updated a route’s coarse city location.
 * No GPS — city comes from the generated stop address snapshot.
 */
export enum RouteLocationSource {
  ARRIVAL = 'ARRIVAL',
  DELIVERY = 'DELIVERY',
}

registerEnumType(RouteLocationSource, {
  name: 'RouteLocationSource',
  description:
    'Authoritative stop event that recorded the route coarse courier city (no GPS)',
})
