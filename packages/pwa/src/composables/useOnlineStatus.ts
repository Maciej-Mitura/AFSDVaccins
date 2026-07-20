import { onMounted, readonly, ref, type Ref } from 'vue'

import { triggerReconnectHandlers } from '@/composables/useGraphQL'

const isOnline = ref(
  typeof navigator !== 'undefined' ? navigator.onLine : true,
)
const lastReconnectedAt = ref<number | null>(null)

let listenersAttached = false

function handleOnline(): void {
  const wasOffline = !isOnline.value
  isOnline.value = true

  if (!wasOffline) {
    return
  }

  lastReconnectedAt.value = Date.now()
  void triggerReconnectHandlers()
}

function handleOffline(): void {
  isOnline.value = false
}

function attachListeners(): void {
  if (typeof window === 'undefined' || listenersAttached) {
    return
  }

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  isOnline.value = navigator.onLine
  listenersAttached = true
}

function detachListeners(): void {
  if (typeof window === 'undefined' || !listenersAttached) {
    return
  }

  window.removeEventListener('online', handleOnline)
  window.removeEventListener('offline', handleOffline)
  listenersAttached = false
}

/**
 * Shared browser online/offline status.
 * Uses a single pair of window listeners for the whole application.
 */
export function useOnlineStatus(): {
  isOnline: Readonly<Ref<boolean>>
  lastReconnectedAt: Readonly<Ref<number | null>>
} {
  onMounted(() => {
    attachListeners()
  })

  // Attach immediately when called during app setup so status is available
  // before the first paint of the PWA status banner.
  attachListeners()

  return {
    isOnline: readonly(isOnline),
    lastReconnectedAt: readonly(lastReconnectedAt),
  }
}

/** Test-only helpers for unit tests. */
export function __resetOnlineStatusForTests(): void {
  detachListeners()
  isOnline.value = typeof navigator !== 'undefined' ? navigator.onLine : true
  lastReconnectedAt.value = null
}

export function __areOnlineListenersAttachedForTests(): boolean {
  return listenersAttached
}
