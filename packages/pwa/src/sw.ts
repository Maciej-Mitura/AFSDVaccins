/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkOnly } from 'workbox-strategies'

import {
  focusOrOpenActionPath,
  parseSafePushPayload,
  shouldDisplayOsNotification,
} from './sw/push-notification-handler'

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
clientsClaim()

/**
 * Navigations: NetworkOnly (no API/GraphQL document caching).
 * Offline → /offline.html from precache. Online SPA routing is server-side
 * (Firebase Hosting / nginx rewrite to index.html).
 */
registerRoute(
  ({ request, url }) => {
    if (request.mode !== 'navigate') {
      return false
    }

    if (url.pathname.startsWith('/api') || url.pathname.includes('/graphql')) {
      return false
    }

    return true
  },
  async options => {
    try {
      return await new NetworkOnly().handle(options)
    } catch {
      const offline = await caches.match('/offline.html', {
        ignoreSearch: true,
      })
      return offline ?? Response.error()
    }
  },
)

self.addEventListener('push', event => {
  event.waitUntil(handlePushEvent(event))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const data = event.notification.data as { actionPath?: string } | undefined
  const origin = self.location.origin

  event.waitUntil(
    focusOrOpenActionPath(self.clients, data?.actionPath ?? null, origin),
  )
})

async function handlePushEvent(event: PushEvent): Promise<void> {
  let raw: unknown = null

  if (event.data) {
    try {
      raw = event.data.json()
    } catch {
      try {
        raw = event.data.text()
      } catch {
        raw = null
      }
    }
  }

  const payload = parseSafePushPayload(raw)

  if (!payload) {
    return
  }

  const display = await shouldDisplayOsNotification(self.clients)

  if (!display) {
    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    })

    for (const client of clients) {
      client.postMessage({
        type: 'PUSH_SUPPRESSED_FOREGROUND',
        notificationId: payload.notificationId,
      })
    }

    return
  }

  await self.registration.showNotification(payload.title, {
    body: payload.body,
    data: {
      notificationId: payload.notificationId,
      type: payload.type,
      actionPath: payload.actionPath ?? '/',
      createdAt: payload.createdAt,
    },
    tag: `notification:${payload.notificationId}`,
  })
}

export {}
