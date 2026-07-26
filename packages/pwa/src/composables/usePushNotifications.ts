/**
 * Push notification capability state machine for the authenticated PWA.
 *
 * States: unsupported | unavailable | prompt | requesting | enabled | denied |
 *         disabled | error
 *
 * Never logs endpoint, p256dh, auth, or bearer tokens.
 * Never exposes raw subscription material in general application state.
 */

import { computed, ref, type Ref, type ComputedRef } from 'vue'

import {
  DISABLE_PUSH_SUBSCRIPTION_MUTATION,
  MY_PUSH_CAPABILITY_QUERY,
  REGISTER_PUSH_SUBSCRIPTION_MUTATION,
  type DisablePushSubscriptionMutation,
  type MyPushCapabilityQuery,
  type RegisterPushSubscriptionMutation,
} from '@/assets/graphql/push'
import { mapGraphQLError } from '@/composables/useCurrentUser'
import useGraphQL from '@/composables/useGraphQL'
import {
  clearPostLoginPushBannerDismissal,
  getBrowserPushPermissionState,
  requestNotificationPermissionFromUserGesture,
  type PushPermissionState,
} from '@/composables/usePushPermissionPrompt'
import {
  isValidVapidPublicKeyFormat,
  readViteVapidPublicKey,
  urlBase64ToUint8Array,
} from '@/utils/vapid'

export type PushNotificationStatus =
  | 'unsupported'
  | 'unavailable'
  | 'prompt'
  | 'requesting'
  | 'enabled'
  | 'denied'
  | 'disabled'
  | 'error'

export type PushCapabilitySnapshot = {
  enabled: boolean
  subscriptionCount: number
  provider: string | null
  /** Present only for capability checks — never shown in UI logs. */
  hasVapidPublicKey: boolean
  permissionGuidance: string | null
}

type BrowserPushSubscriptionLike = {
  endpoint: string
  toJSON: () => {
    endpoint?: string
    keys?: { p256dh?: string; auth?: string }
  }
  unsubscribe: () => Promise<boolean>
}

type PushManagerLike = {
  getSubscription: () => Promise<BrowserPushSubscriptionLike | null>
  subscribe: (options: {
    userVisibleOnly: boolean
    applicationServerKey: BufferSource
  }) => Promise<BrowserPushSubscriptionLike>
}

type ServiceWorkerRegistrationLike = {
  pushManager: PushManagerLike
}

export type PushNotificationsApi = {
  status: Ref<PushNotificationStatus>
  errorMessage: Ref<string | null>
  capability: Ref<PushCapabilitySnapshot | null>
  permission: Ref<PushPermissionState>
  busy: Ref<boolean>
  isEnabled: ComputedRef<boolean>
  canEnable: ComputedRef<boolean>
  refresh: () => Promise<void>
  enableFromUserGesture: () => Promise<boolean>
  disableFromUserGesture: () => Promise<boolean>
  resetSession: () => void
}

const status = ref<PushNotificationStatus>('unavailable')
const errorMessage = ref<string | null>(null)
const capability = ref<PushCapabilitySnapshot | null>(null)
const permission = ref<PushPermissionState>('unsupported')
const busy = ref(false)

/** Bound user id for the current capability session (account isolation). */
let boundUserId: string | null = null

function detectSupport(): {
  notificationApi: boolean
  serviceWorker: boolean
  pushManager: boolean
} {
  const notificationApi =
    typeof window !== 'undefined' && typeof Notification !== 'undefined'
  const serviceWorker =
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
  const pushManager = typeof window !== 'undefined' && 'PushManager' in window

  return { notificationApi, serviceWorker, pushManager }
}

function mapPermissionToStatus(
  perm: PushPermissionState,
  hasLocalSubscription: boolean,
  backendEnabled: boolean,
): PushNotificationStatus {
  if (perm === 'unsupported') {
    return 'unsupported'
  }

  if (perm === 'denied') {
    return 'denied'
  }

  if (perm === 'granted' && hasLocalSubscription && backendEnabled) {
    return 'enabled'
  }

  if (perm === 'granted' && (!hasLocalSubscription || !backendEnabled)) {
    return 'disabled'
  }

  return 'prompt'
}

function toCapabilitySnapshot(
  data: MyPushCapabilityQuery['myPushCapability'] | null | undefined,
): PushCapabilitySnapshot | null {
  if (!data) {
    return null
  }

  return {
    enabled: data.enabled,
    subscriptionCount: data.subscriptionCount,
    provider: data.provider ?? null,
    hasVapidPublicKey: Boolean(data.vapidPublicKey),
    permissionGuidance: data.permissionGuidance ?? null,
  }
}

function resolveApplicationServerKey(
  capabilityKey: string | null | undefined,
): string {
  const fromEnv = readViteVapidPublicKey()
  if (fromEnv) {
    return fromEnv
  }

  const fromCapability = capabilityKey?.trim() ?? ''
  if (fromCapability && isValidVapidPublicKeyFormat(fromCapability)) {
    return fromCapability
  }

  throw new Error('VAPID_PUBLIC_KEY_UNAVAILABLE')
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistrationLike> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('SERVICE_WORKER_UNSUPPORTED')
  }

  return await navigator.serviceWorker.ready
}

async function readLocalSubscription(): Promise<BrowserPushSubscriptionLike | null> {
  try {
    const registration = await getServiceWorkerRegistration()
    return await registration.pushManager.getSubscription()
  } catch {
    return null
  }
}

/**
 * Extracts subscription keys for backend registration only.
 * Callers must not put the return value into reactive UI state.
 */
function extractSubscriptionKeys(subscription: BrowserPushSubscriptionLike): {
  endpoint: string
  p256dh: string
  auth: string
} {
  const json = subscription.toJSON()
  const endpoint = json.endpoint ?? subscription.endpoint
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth

  if (!endpoint || !p256dh || !auth) {
    throw new Error('SUBSCRIPTION_KEYS_MISSING')
  }

  return { endpoint, p256dh, auth }
}

export function usePushNotifications(): PushNotificationsApi {
  const { apolloClient } = useGraphQL()

  const isEnabled = computed(() => status.value === 'enabled')
  const canEnable = computed(
    () =>
      status.value === 'prompt' ||
      status.value === 'disabled' ||
      status.value === 'error',
  )

  async function queryCapability(): Promise<
    MyPushCapabilityQuery['myPushCapability'] | null
  > {
    const result = await apolloClient.query<MyPushCapabilityQuery>({
      query: MY_PUSH_CAPABILITY_QUERY,
      fetchPolicy: 'network-only',
    })

    return result.data.myPushCapability
  }

  async function refresh(): Promise<void> {
    errorMessage.value = null
    const support = detectSupport()

    if (!support.notificationApi) {
      status.value = 'unsupported'
      permission.value = 'unsupported'
      return
    }

    if (!support.serviceWorker || !support.pushManager) {
      status.value = 'unsupported'
      permission.value = getBrowserPushPermissionState()
      return
    }

    permission.value = getBrowserPushPermissionState()

    let capabilityData: MyPushCapabilityQuery['myPushCapability'] | null = null

    try {
      capabilityData = await queryCapability()
      capability.value = toCapabilitySnapshot(capabilityData)
    } catch (error: unknown) {
      capability.value = null
      status.value = 'error'
      errorMessage.value = mapGraphQLError(error)
      return
    }

    const localSub = await readLocalSubscription()
    const hasLocal = localSub != null
    const backendEnabled = capabilityData?.enabled === true

    // Missing VAPID when backend expects webpush → unavailable, not enabled.
    const envKey = readViteVapidPublicKey()
    const capabilityKey = capabilityData?.vapidPublicKey?.trim() ?? ''
    const hasKey =
      Boolean(envKey) ||
      (capabilityKey.length > 0 && isValidVapidPublicKeyFormat(capabilityKey))

    if (!hasKey && permission.value === 'default') {
      status.value = 'unavailable'
      return
    }

    status.value = mapPermissionToStatus(
      permission.value,
      hasLocal,
      backendEnabled,
    )
  }

  async function enableFromUserGesture(): Promise<boolean> {
    if (busy.value) {
      return false
    }

    busy.value = true
    errorMessage.value = null
    status.value = 'requesting'

    try {
      const support = detectSupport()
      if (
        !support.notificationApi ||
        !support.serviceWorker ||
        !support.pushManager
      ) {
        status.value = 'unsupported'
        errorMessage.value = 'UNSUPPORTED'
        return false
      }

      let perm = getBrowserPushPermissionState()
      if (perm === 'default') {
        perm = await requestNotificationPermissionFromUserGesture()
      }

      permission.value = perm

      if (perm === 'denied') {
        status.value = 'denied'
        return false
      }

      if (perm !== 'granted') {
        status.value = 'prompt'
        return false
      }

      const capabilityData = await queryCapability()
      capability.value = toCapabilitySnapshot(capabilityData)

      const applicationServerKey = resolveApplicationServerKey(
        capabilityData?.vapidPublicKey,
      )

      const registration = await getServiceWorkerRegistration()
      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            applicationServerKey,
          ) as BufferSource,
        })
      }

      // Keep keys in a local const — never assign to reactive state.
      const keys = extractSubscriptionKeys(subscription)

      const result =
        await apolloClient.mutate<RegisterPushSubscriptionMutation>({
          mutation: REGISTER_PUSH_SUBSCRIPTION_MUTATION,
          variables: {
            input: {
              endpoint: keys.endpoint,
              p256dh: keys.p256dh,
              auth: keys.auth,
              userAgentSummary:
                typeof navigator !== 'undefined'
                  ? navigator.userAgent.slice(0, 160)
                  : undefined,
              permissionState: 'granted',
            },
          },
        })

      const registered = result.data?.registerPushSubscription
      capability.value = toCapabilitySnapshot(registered)

      if (!registered?.enabled) {
        status.value = 'error'
        errorMessage.value = 'REGISTER_FAILED'
        return false
      }

      clearPostLoginPushBannerDismissal()
      status.value = 'enabled'
      return true
    } catch (error: unknown) {
      status.value = 'error'
      if (
        error instanceof Error &&
        error.message === 'VAPID_PUBLIC_KEY_UNAVAILABLE'
      ) {
        errorMessage.value = 'VAPID_CONFIG'
      } else if (
        error instanceof Error &&
        error.message === 'SERVICE_WORKER_UNSUPPORTED'
      ) {
        status.value = 'unsupported'
        errorMessage.value = 'UNSUPPORTED'
      } else {
        errorMessage.value = mapGraphQLError(error)
      }

      return false
    } finally {
      busy.value = false
    }
  }

  async function disableFromUserGesture(): Promise<boolean> {
    if (busy.value) {
      return false
    }

    busy.value = true
    errorMessage.value = null

    try {
      const localSub = await readLocalSubscription()
      let endpoint: string | undefined

      if (localSub) {
        // Only capture endpoint string for the disable mutation — not keys.
        endpoint = localSub.endpoint
      }

      const result = await apolloClient.mutate<DisablePushSubscriptionMutation>(
        {
          mutation: DISABLE_PUSH_SUBSCRIPTION_MUTATION,
          variables: {
            input: endpoint ? { endpoint } : undefined,
          },
        },
      )

      capability.value = toCapabilitySnapshot(
        result.data?.disablePushSubscription,
      )

      if (localSub) {
        try {
          await localSub.unsubscribe()
        } catch {
          // Browser unsubscribe failure should not leave UI stuck as enabled
          // after backend disable succeeded.
          errorMessage.value = 'UNSUBSCRIBE_BROWSER'
        }
      }

      permission.value = getBrowserPushPermissionState()
      status.value =
        permission.value === 'denied'
          ? 'denied'
          : permission.value === 'granted'
            ? 'disabled'
            : 'prompt'

      return true
    } catch (error: unknown) {
      status.value = 'error'
      errorMessage.value = mapGraphQLError(error)
      return false
    } finally {
      busy.value = false
    }
  }

  function resetSession(): void {
    boundUserId = null
    status.value = 'unavailable'
    errorMessage.value = null
    capability.value = null
    permission.value = getBrowserPushPermissionState()
    busy.value = false
  }

  return {
    status,
    errorMessage,
    capability,
    permission,
    busy,
    isEnabled,
    canEnable,
    refresh,
    enableFromUserGesture,
    disableFromUserGesture,
    resetSession,
  }
}

export function __setPushBoundUserIdForTests(userId: string | null): void {
  boundUserId = userId
}

export function __getPushBoundUserIdForTests(): string | null {
  return boundUserId
}

export function __resetPushNotificationsForTests(): void {
  boundUserId = null
  status.value = 'unavailable'
  errorMessage.value = null
  capability.value = null
  permission.value = 'unsupported'
  busy.value = false
}
