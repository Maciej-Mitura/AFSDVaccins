import { Inject, Injectable } from '@nestjs/common'
import { PubSub } from 'graphql-subscriptions'

import {
  NOTIFICATION_RECEIVED_EVENT,
  PUB_SUB,
} from '../common/pubsub/pubsub.constants'
import { Notification } from './notification.entity'

@Injectable()
export class NotificationEventsService {
  constructor(@Inject(PUB_SUB) private readonly pubSub: PubSub) {}

  async publishNotificationReceived(
    notification: Notification,
  ): Promise<void> {
    await this.pubSub.publish(NOTIFICATION_RECEIVED_EVENT, {
      notificationReceived: notification,
    })
  }
}
