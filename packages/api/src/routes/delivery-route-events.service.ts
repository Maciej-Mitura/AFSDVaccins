import { Inject, Injectable } from '@nestjs/common'
import { PubSub } from 'graphql-subscriptions'

import {
  BEZORGER_ROUTE_UPDATED_EVENT,
  PUB_SUB,
} from '../common/pubsub/pubsub.constants'
import { DeliveryRoute } from './delivery-route.entity'

@Injectable()
export class DeliveryRouteEventsService {
  constructor(@Inject(PUB_SUB) private readonly pubSub: PubSub) {}

  async publishBezorgerRouteUpdated(route: DeliveryRoute): Promise<void> {
    await this.pubSub.publish(BEZORGER_ROUTE_UPDATED_EVENT, {
      bezorgerRouteUpdates: route,
    })
  }
}
