import { ref } from 'vue'

import {
  ADMIN_OPERATIONS_FEED_SUBSCRIPTION,
  type AdminOperationsFeedSubscription,
} from '@/assets/graphql/order.subscription'
import useGraphQL, { registerReconnectHandler } from '@/composables/useGraphQL'

export type AdminOperationsFeedItem =
  AdminOperationsFeedSubscription['adminOperationsFeed']

const feedEvents = ref<AdminOperationsFeedItem[]>([])

let subscriptionCleanup: (() => void) | null = null
let reconnectCleanup: (() => void) | null = null

export function useAdminOperationsFeed() {
  const { apolloClient } = useGraphQL()

  function stopFeedSubscription(): void {
    subscriptionCleanup?.()
    subscriptionCleanup = null
  }

  function subscribeToAdminOperationsFeed(): () => void {
    stopFeedSubscription()

    const subscription = apolloClient
      .subscribe<AdminOperationsFeedSubscription>({
        query: ADMIN_OPERATIONS_FEED_SUBSCRIPTION,
      })
      .subscribe({
        next: ({ data }) => {
          const event = data?.adminOperationsFeed

          if (event) {
            feedEvents.value = [event, ...feedEvents.value].slice(0, 50)
          }
        },
      })

    const cleanup = (): void => {
      subscription.unsubscribe()
      subscriptionCleanup = null
    }

    subscriptionCleanup = cleanup

    return cleanup
  }

  function registerFeedReconnect(
    refetchHandlers: Array<() => void | Promise<void>> = [],
  ): () => void {
    reconnectCleanup?.()

    reconnectCleanup = registerReconnectHandler(async () => {
      await Promise.all(refetchHandlers.map(handler => Promise.resolve(handler())))
    })

    return () => {
      reconnectCleanup?.()
      reconnectCleanup = null
    }
  }

  function clearFeedState(): void {
    stopFeedSubscription()
    reconnectCleanup?.()
    reconnectCleanup = null
    feedEvents.value = []
  }

  return {
    feedEvents,
    subscribeToAdminOperationsFeed,
    stopFeedSubscription,
    registerFeedReconnect,
    clearFeedState,
  }
}
