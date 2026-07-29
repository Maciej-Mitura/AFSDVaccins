import { ApolloError } from '@apollo/client/core'
import { RouteStatus } from '@vaccin-delivery/types'
import { computed, ref } from 'vue'

import {
  BEZORGER_ROUTE_UPDATES_SUBSCRIPTION,
  DELIVERY_ROUTES_QUERY,
  GENERATE_DELIVERY_ROUTE_MUTATION,
  MY_TODAY_ROUTE_QUERY,
  MY_TOMORROW_ROUTE_PREVIEW_QUERY,
  ROUTE_PLANNING_DIAGNOSTICS_QUERY,
  UPDATE_ROUTE_STATUS_MUTATION,
  type BezorgerRouteUpdatesSubscription,
  type DeliveryRoutesQuery,
  type DeliveryRoutesQueryVariables,
  type GenerateDeliveryRouteMutation,
  type GenerateDeliveryRouteMutationVariables,
  type MyTodayRouteQuery,
  type MyTomorrowRoutePreviewQuery,
  type RoutePlanningDiagnosticsQuery,
  type RoutePlanningDiagnosticsQueryVariables,
  type UpdateRouteStatusMutation,
  type UpdateRouteStatusMutationVariables,
} from '@/assets/graphql/routes'
import { ROUTE_TEMPLATES_QUERY } from '@/assets/graphql/route-templates'
import type { RouteTemplatesQuery } from '@/assets/graphql/route-templates'
import { mapGraphQLError, useCurrentUser } from '@/composables/useCurrentUser'
import useGraphQL, { registerReconnectHandler } from '@/composables/useGraphQL'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import {
  getCourierRouteOfflineCacheService,
  getOfflineCacheOwnerService,
  getOfflineStorageStatus,
  isOfflineSessionUnlocked,
  type CacheOwnerIdentity,
} from '@/offline'
import { hydrateDeliveryRouteFromCache } from '@/offline/hydrate-from-cache'
import {
  classifyRequestFailure,
  isAuthBarrierFailure,
  isNetworkUnavailableFailure,
  offlineUiErrorMessageKey,
  type OfflineUiErrorCategory,
  type RouteDataSource,
} from '@/offline/ui-error-category'
import {
  formatDateTime,
  routeStatusLabel,
  translate,
  translatePlural,
} from '@/i18n'

export type DeliveryRouteItem = NonNullable<
  DeliveryRoutesQuery['deliveryRoutes'][number]
>
export type DeliveryStopItem = DeliveryRouteItem['stops'][number]
export type RouteStatusHistoryItem = DeliveryRouteItem['statusHistory'][number]
export type RoutePreviewItem =
  MyTomorrowRoutePreviewQuery['myTomorrowRoutePreview']
export type RoutePreviewStopItem = RoutePreviewItem['stops'][number]
export type ActiveRouteTemplateOption =
  RouteTemplatesQuery['routeTemplates'][number]
export type RouteStatusValue = RouteStatus
export type RouteGenerationDiagnosticsItem = NonNullable<
  GenerateDeliveryRouteMutation['generateDeliveryRoute']
>['diagnostics']
export type RoutePlanningDiagnosticsItem =
  RoutePlanningDiagnosticsQuery['routePlanningDiagnostics']
export type RouteGenerationSkipGroupItem =
  RouteGenerationDiagnosticsItem['skipGroups'][number]
export { RouteStatus }
export type { OfflineUiErrorCategory, RouteDataSource }

const deliveryRoutes = ref<DeliveryRouteItem[]>([])
const myTodayRoute = ref<DeliveryRouteItem | null>(null)
const myTomorrowRoutePreview = ref<RoutePreviewItem | null>(null)
const activeTemplates = ref<ActiveRouteTemplateOption[]>([])
const loading = ref(false)
const refreshing = ref(false)
const previewLoading = ref(false)
const templatesLoading = ref(false)
const generating = ref(false)
const updatingStatus = ref(false)
const errorMessage = ref<string | null>(null)
const previewErrorMessage = ref<string | null>(null)
const previewErrorCode = ref<string | null>(null)
const generateError = ref<string | null>(null)
const statusError = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const lastGenerationDiagnostics = ref<RouteGenerationDiagnosticsItem | null>(
  null,
)
const planningDiagnostics = ref<RoutePlanningDiagnosticsItem | null>(null)
const planningDiagnosticsLoading = ref(false)
const planningDiagnosticsError = ref<string | null>(null)

const todayRouteSource = ref<RouteDataSource>('NONE')
const todayRouteCachedAt = ref<string | null>(null)
const todayRouteExpiresAt = ref<string | null>(null)
const todayRouteErrorCategory = ref<OfflineUiErrorCategory | null>(null)
const todayRouteRefreshError = ref<string | null>(null)

let todayRouteSubscriptionCleanup: (() => void) | null = null
let todayRouteReconnectCleanup: (() => void) | null = null
let tomorrowPreviewReconnectCleanup: (() => void) | null = null
let todayRouteLoadGeneration = 0

function extractGraphQLErrorCode(error: unknown): string | null {
  if (!(error instanceof ApolloError)) {
    return null
  }

  for (const graphQLError of error.graphQLErrors) {
    const code = graphQLError.extensions?.code
    if (
      typeof code === 'string' &&
      code.length > 0 &&
      code !== 'INTERNAL_SERVER_ERROR' &&
      code !== 'GRAPHQL_VALIDATION_FAILED'
    ) {
      return code
    }

    const originalError = graphQLError.extensions?.originalError as
      { error?: string } | undefined
    if (
      typeof originalError?.error === 'string' &&
      originalError.error.length > 0
    ) {
      return originalError.error
    }
  }

  return null
}

function upsertDeliveryRoute(route: DeliveryRouteItem): void {
  const existingIndex = deliveryRoutes.value.findIndex(
    item => item.id === route.id,
  )

  if (existingIndex === -1) {
    deliveryRoutes.value = [route, ...deliveryRoutes.value]
  } else {
    const next = [...deliveryRoutes.value]
    next[existingIndex] = route
    deliveryRoutes.value = next
  }
}

function setServerRouteState(route: DeliveryRouteItem | null): void {
  myTodayRoute.value = route
  todayRouteSource.value = route ? 'SERVER' : 'NONE'
  todayRouteCachedAt.value = null
  todayRouteExpiresAt.value = null
  todayRouteErrorCategory.value = null
  todayRouteRefreshError.value = null
  errorMessage.value = null
}

function setCachedRouteState(
  route: DeliveryRouteItem,
  cachedAt: string,
  expiresAt: string,
): void {
  myTodayRoute.value = route
  todayRouteSource.value = 'CACHE'
  todayRouteCachedAt.value = cachedAt
  todayRouteExpiresAt.value = expiresAt
  todayRouteErrorCategory.value = null
  errorMessage.value = null
}

function setUnavailableRouteState(
  category: OfflineUiErrorCategory,
  messageKey?: string,
): void {
  myTodayRoute.value = null
  todayRouteSource.value = 'NONE'
  todayRouteCachedAt.value = null
  todayRouteExpiresAt.value = null
  todayRouteErrorCategory.value = category
  errorMessage.value = translate(
    messageKey ?? offlineUiErrorMessageKey(category),
  )
}

async function resolveCourierCacheOwner(): Promise<CacheOwnerIdentity | null> {
  const { currentUser, initialized } = useCurrentUser()

  if (!initialized.value) {
    return null
  }

  const user = currentUser.value
  const bezorgerProfileId = user?.bezorgerProfile?.id
  if (!user?.id || !bezorgerProfileId) {
    return null
  }

  // Only re-bind when locked — avoid wiping expired rows before category detection.
  if (!isOfflineSessionUnlocked()) {
    try {
      await getOfflineCacheOwnerService().resolveAuthenticatedOwner({
        role: user.role,
        userId: user.id,
        bezorgerProfileId,
      })
    } catch {
      return null
    }
  }

  if (!isOfflineSessionUnlocked()) {
    return null
  }

  return {
    userId: user.id,
    bezorgerProfileId,
  }
}

export function useDeliveryRoutes() {
  const { apolloClient } = useGraphQL()
  const { isOnline } = useOnlineStatus()

  const todayRouteIsReadOnly = computed(
    () => todayRouteSource.value === 'CACHE',
  )
  const todayRouteIsStaleSnapshot = computed(
    () => todayRouteSource.value === 'CACHE',
  )

  async function loadActiveTemplates(): Promise<void> {
    templatesLoading.value = true

    try {
      const result = await apolloClient.query<RouteTemplatesQuery>({
        query: ROUTE_TEMPLATES_QUERY,
        variables: { includeInactive: false },
        fetchPolicy: 'network-only',
      })
      activeTemplates.value = result.data.routeTemplates.filter(
        template => template.active,
      )
    } catch (error) {
      errorMessage.value = mapGraphQLError(error)
    } finally {
      templatesLoading.value = false
    }
  }

  async function loadDeliveryRoutes(
    variables: DeliveryRoutesQueryVariables = {},
  ): Promise<void> {
    loading.value = true
    errorMessage.value = null

    try {
      const result = await apolloClient.query<DeliveryRoutesQuery>({
        query: DELIVERY_ROUTES_QUERY,
        variables,
        fetchPolicy: 'network-only',
      })
      deliveryRoutes.value = result.data.deliveryRoutes
    } catch (error) {
      errorMessage.value = mapGraphQLError(error)
      deliveryRoutes.value = []
    } finally {
      loading.value = false
    }
  }

  async function tryLoadCachedTodayRoute(options?: {
    preferExpiredCategory?: boolean
  }): Promise<boolean> {
    const storage = getOfflineStorageStatus()
    if (storage.mode === 'online-only' || storage.mode === 'unavailable') {
      setUnavailableRouteState('CACHE_UNAVAILABLE')
      return false
    }

    const owner = await resolveCourierCacheOwner()
    if (!owner) {
      setUnavailableRouteState('AUTH_REQUIRED')
      return false
    }

    try {
      const { record, expiredFound } =
        await getCourierRouteOfflineCacheService().readValidRouteForOwner(owner)

      if (record) {
        setCachedRouteState(
          hydrateDeliveryRouteFromCache(record),
          record.fetchedAt,
          record.expiresAt,
        )
        return true
      }

      if (expiredFound || options?.preferExpiredCategory) {
        setUnavailableRouteState('OFFLINE_CACHE_EXPIRED')
        return false
      }

      setUnavailableRouteState('OFFLINE_NO_CACHE', 'offline.route.unavailable')
      return false
    } catch {
      setUnavailableRouteState('CACHE_UNAVAILABLE')
      return false
    }
  }

  async function applyServerTodayRoute(
    route: DeliveryRouteItem | null,
  ): Promise<void> {
    setServerRouteState(route)
    apolloClient.writeQuery({
      query: MY_TODAY_ROUTE_QUERY,
      data: { myTodayRoute: route },
    })

    const owner = await resolveCourierCacheOwner()
    if (!owner) {
      return
    }

    try {
      if (route) {
        await getCourierRouteOfflineCacheService().writeFromOnlineRoute({
          owner,
          route,
          enforceAssignedCourier: true,
        })
      } else {
        await getCourierRouteOfflineCacheService().clearOwnerRoutes(owner)
      }
    } catch {
      // IndexedDB failure must not break the online route flow.
    }
  }

  async function loadMyTodayRoute(options?: {
    isRefresh?: boolean
  }): Promise<void> {
    const generation = ++todayRouteLoadGeneration
    const isRefresh = options?.isRefresh === true
    const keepShowingRoute = isRefresh && myTodayRoute.value !== null
    const wasCached = todayRouteSource.value === 'CACHE'

    if (keepShowingRoute) {
      refreshing.value = true
      todayRouteRefreshError.value = null
    } else {
      loading.value = true
      errorMessage.value = null
      todayRouteErrorCategory.value = null
      todayRouteRefreshError.value = null
    }

    const { currentUser, initialized } = useCurrentUser()

    // Never render private cache until auth identity has fully resolved.
    if (!initialized.value) {
      if (!keepShowingRoute) {
        myTodayRoute.value = null
        todayRouteSource.value = 'NONE'
      }
      loading.value = false
      refreshing.value = false
      return
    }

    if (!currentUser.value?.id || !currentUser.value.bezorgerProfile?.id) {
      clearTodayRouteState()
      setUnavailableRouteState('AUTH_REQUIRED')
      loading.value = false
      refreshing.value = false
      return
    }

    // Browser offline: skip unnecessary online refetch; read cache directly.
    if (!isOnline.value) {
      await tryLoadCachedTodayRoute()
      if (generation !== todayRouteLoadGeneration) {
        return
      }
      loading.value = false
      refreshing.value = false
      return
    }

    try {
      const result = await apolloClient.query<MyTodayRouteQuery>({
        query: MY_TODAY_ROUTE_QUERY,
        fetchPolicy: 'network-only',
      })

      if (generation !== todayRouteLoadGeneration) {
        return
      }

      // Server result always wins — including null (no current route).
      await applyServerTodayRoute(result.data.myTodayRoute ?? null)
    } catch (error) {
      if (generation !== todayRouteLoadGeneration) {
        return
      }

      if (isAuthBarrierFailure(error)) {
        clearTodayRouteState()
        const category = classifyRequestFailure(error)
        setUnavailableRouteState(category)
        return
      }

      if (isNetworkUnavailableFailure(error)) {
        if (keepShowingRoute && wasCached) {
          todayRouteRefreshError.value = translate(
            'offline.route.refreshFailed',
          )
          return
        }

        if (keepShowingRoute && !wasCached) {
          // Keep prior server route visible on transient network errors.
          todayRouteRefreshError.value = translate(
            'offline.route.refreshFailed',
          )
          return
        }

        await tryLoadCachedTodayRoute()
        return
      }

      // Domain / GraphQL errors: do not fall back to cache.
      if (keepShowingRoute && wasCached) {
        todayRouteRefreshError.value = mapGraphQLError(error)
        return
      }

      myTodayRoute.value = null
      todayRouteSource.value = 'NONE'
      todayRouteCachedAt.value = null
      todayRouteExpiresAt.value = null
      todayRouteErrorCategory.value = 'SERVER_ERROR'
      errorMessage.value = mapGraphQLError(error)
    } finally {
      if (generation === todayRouteLoadGeneration) {
        loading.value = false
        refreshing.value = false
      }
    }
  }

  async function cacheMyTodayRouteSnapshot(
    route: DeliveryRouteItem | null,
  ): Promise<void> {
    if (!route) {
      return
    }

    try {
      const owner = await resolveCourierCacheOwner()
      if (!owner) {
        return
      }

      await getCourierRouteOfflineCacheService().writeFromOnlineRoute({
        owner,
        route,
        enforceAssignedCourier: true,
      })
    } catch {
      // IndexedDB failure must not break the online route flow.
    }
  }

  async function loadMyTomorrowRoutePreview(): Promise<void> {
    previewLoading.value = true
    previewErrorMessage.value = null
    previewErrorCode.value = null

    try {
      const result = await apolloClient.query<MyTomorrowRoutePreviewQuery>({
        query: MY_TOMORROW_ROUTE_PREVIEW_QUERY,
        fetchPolicy: 'network-only',
      })
      myTomorrowRoutePreview.value = result.data.myTomorrowRoutePreview
    } catch (error) {
      previewErrorMessage.value = mapGraphQLError(error)
      previewErrorCode.value = extractGraphQLErrorCode(error)
      myTomorrowRoutePreview.value = null
    } finally {
      previewLoading.value = false
    }
  }

  async function generateDeliveryRoute(
    routeTemplateId: string,
    deliveryDate: string,
  ): Promise<DeliveryRouteItem | null> {
    generating.value = true
    generateError.value = null
    successMessage.value = null
    lastGenerationDiagnostics.value = null

    try {
      const result = await apolloClient.mutate<
        GenerateDeliveryRouteMutation,
        GenerateDeliveryRouteMutationVariables
      >({
        mutation: GENERATE_DELIVERY_ROUTE_MUTATION,
        variables: { routeTemplateId, deliveryDate },
      })

      const payload = result.data?.generateDeliveryRoute ?? null
      const route = payload?.route ?? null
      const diagnostics = payload?.diagnostics ?? null

      if (route) {
        upsertDeliveryRoute(route)
        lastGenerationDiagnostics.value = diagnostics

        const skippedOrders = diagnostics?.skippedOrderCount ?? 0
        const skippedPharmacies = diagnostics?.skippedPharmacyCount ?? 0

        if (
          route.stops.length === 0 &&
          skippedOrders === 0 &&
          skippedPharmacies === 0
        ) {
          successMessage.value = translate('success.routes.generatedEmpty')
        } else if (skippedOrders > 0 || skippedPharmacies > 0) {
          successMessage.value = translate('success.routes.generatedPartial', {
            stops: route.stops.length,
            orders: diagnostics?.includedOrderCount ?? 0,
            skipped: skippedOrders + skippedPharmacies,
          })
        } else {
          successMessage.value = translatePlural(
            'success.routes.generatedStops',
            route.stops.length,
          )
        }
      }

      return route
    } catch (error) {
      generateError.value = mapGraphQLError(error)
      return null
    } finally {
      generating.value = false
    }
  }

  async function loadRoutePlanningDiagnostics(params: {
    deliveryDate: string
    routeTemplateId?: string | null
  }): Promise<RoutePlanningDiagnosticsItem | null> {
    planningDiagnosticsLoading.value = true
    planningDiagnosticsError.value = null

    try {
      const result = await apolloClient.query<
        RoutePlanningDiagnosticsQuery,
        RoutePlanningDiagnosticsQueryVariables
      >({
        query: ROUTE_PLANNING_DIAGNOSTICS_QUERY,
        variables: {
          deliveryDate: params.deliveryDate,
          routeTemplateId: params.routeTemplateId ?? null,
        },
        fetchPolicy: 'network-only',
      })
      planningDiagnostics.value = result.data.routePlanningDiagnostics
      return planningDiagnostics.value
    } catch (error) {
      planningDiagnosticsError.value = mapGraphQLError(error)
      planningDiagnostics.value = null
      return null
    } finally {
      planningDiagnosticsLoading.value = false
    }
  }

  async function updateRouteStatus(
    id: string,
    status: RouteStatusValue,
    reason?: string | null,
  ): Promise<DeliveryRouteItem | null> {
    if (todayRouteIsReadOnly.value) {
      statusError.value = translate('offline.action.requiresConnection')
      return null
    }

    updatingStatus.value = true
    statusError.value = null
    successMessage.value = null

    try {
      const result = await apolloClient.mutate<
        UpdateRouteStatusMutation,
        UpdateRouteStatusMutationVariables
      >({
        mutation: UPDATE_ROUTE_STATUS_MUTATION,
        variables: {
          id,
          status,
          reason: reason?.trim() ? reason.trim() : undefined,
        },
      })

      const route = result.data?.updateRouteStatus ?? null

      if (route) {
        upsertDeliveryRoute(route)

        if (myTodayRoute.value?.id === route.id) {
          setServerRouteState(route)
          apolloClient.writeQuery({
            query: MY_TODAY_ROUTE_QUERY,
            data: { myTodayRoute: route },
          })
          void cacheMyTodayRouteSnapshot(route)
        }

        successMessage.value = translate('success.routes.statusUpdated', {
          status: routeStatusLabel(route.status),
        })
      }

      return route
    } catch (error) {
      statusError.value = mapGraphQLError(error)
      return null
    } finally {
      updatingStatus.value = false
    }
  }

  function stopTodayRouteSubscription(): void {
    todayRouteSubscriptionCleanup?.()
    todayRouteSubscriptionCleanup = null
    todayRouteReconnectCleanup?.()
    todayRouteReconnectCleanup = null
  }

  function stopTomorrowPreviewReconnect(): void {
    tomorrowPreviewReconnectCleanup?.()
    tomorrowPreviewReconnectCleanup = null
  }

  function subscribeToTomorrowPreviewReconnect(): () => void {
    stopTomorrowPreviewReconnect()

    tomorrowPreviewReconnectCleanup = registerReconnectHandler(() => {
      void loadMyTomorrowRoutePreview()
    })

    return stopTomorrowPreviewReconnect
  }

  function subscribeToTodayRouteUpdates(): () => void {
    stopTodayRouteSubscription()

    const subscription = apolloClient
      .subscribe<BezorgerRouteUpdatesSubscription>({
        query: BEZORGER_ROUTE_UPDATES_SUBSCRIPTION,
      })
      .subscribe({
        next: ({ data }) => {
          const route = data?.bezorgerRouteUpdates

          if (route) {
            // Update online UI immediately from the event.
            myTodayRoute.value = route
            todayRouteSource.value = 'SERVER'
            todayRouteCachedAt.value = null
            todayRouteExpiresAt.value = null
            todayRouteErrorCategory.value = null
            apolloClient.writeQuery({
              query: MY_TODAY_ROUTE_QUERY,
              data: { myTodayRoute: route },
            })
            // Do not write subscription payloads into IndexedDB — refetch a
            // complete validated snapshot after meaningful realtime changes.
            void loadMyTodayRoute({ isRefresh: true })
          }
        },
      })

    todayRouteReconnectCleanup = registerReconnectHandler(() => {
      void loadMyTodayRoute({ isRefresh: true })
    })

    const cleanup = (): void => {
      subscription.unsubscribe()
      todayRouteReconnectCleanup?.()
      todayRouteReconnectCleanup = null
      todayRouteSubscriptionCleanup = null
    }

    todayRouteSubscriptionCleanup = cleanup

    return cleanup
  }

  function clearTodayRouteState(): void {
    todayRouteLoadGeneration += 1
    myTodayRoute.value = null
    todayRouteSource.value = 'NONE'
    todayRouteCachedAt.value = null
    todayRouteExpiresAt.value = null
    todayRouteErrorCategory.value = null
    todayRouteRefreshError.value = null
    errorMessage.value = null
    statusError.value = null
    loading.value = false
    refreshing.value = false
    updatingStatus.value = false
  }

  function formatAddress(
    stop: DeliveryStopItem | RoutePreviewStopItem,
  ): string {
    const { address } = stop
    return `${address.street} ${address.houseNumber}, ${address.postalCode} ${address.city}`
  }

  function formatStatusHistoryEntry(entry: RouteStatusHistoryItem): string {
    const before = entry.fromStatus ? routeStatusLabel(entry.fromStatus) : '—'
    const after = routeStatusLabel(entry.toStatus)
    const date = formatDateTime(entry.changedAt)

    if (entry.reason) {
      return translate('routes.statusHistory.entryWithReason', {
        before,
        after,
        date,
        reason: entry.reason,
      })
    }

    return translate('routes.statusHistory.entry', { before, after, date })
  }

  function isRouteTemplateInactiveError(error: unknown): boolean {
    return extractGraphQLErrorCode(error) === 'ROUTE_TEMPLATE_INACTIVE'
  }

  function isDeliveryRouteNotRegenerableError(error: unknown): boolean {
    return extractGraphQLErrorCode(error) === 'DELIVERY_ROUTE_NOT_REGENERABLE'
  }

  function isMissingTemplatePreviewError(code: string | null): boolean {
    return (
      code === 'ROUTE_TEMPLATE_NOT_ASSIGNED' ||
      code === 'BEZORGER_PROFILE_NOT_FOUND'
    )
  }

  function isMultipleActiveTemplatePreviewError(code: string | null): boolean {
    return (
      code === 'ROUTE_TEMPLATE_MULTIPLE_ACTIVE_FOR_COURIER' ||
      code === 'MULTIPLE_ACTIVE_ROUTE_TEMPLATES'
    )
  }

  function canRegenerateRoute(status: RouteStatusValue): boolean {
    return status === RouteStatus.Assigned || status === RouteStatus.Cancelled
  }

  return {
    deliveryRoutes,
    myTodayRoute,
    myTomorrowRoutePreview,
    activeTemplates,
    loading,
    refreshing,
    previewLoading,
    templatesLoading,
    generating,
    updatingStatus,
    errorMessage,
    previewErrorMessage,
    previewErrorCode,
    generateError,
    statusError,
    successMessage,
    lastGenerationDiagnostics,
    planningDiagnostics,
    planningDiagnosticsLoading,
    planningDiagnosticsError,
    todayRouteSource,
    todayRouteCachedAt,
    todayRouteExpiresAt,
    todayRouteErrorCategory,
    todayRouteRefreshError,
    todayRouteIsReadOnly,
    todayRouteIsStaleSnapshot,
    isOnline,
    loadActiveTemplates,
    loadDeliveryRoutes,
    loadMyTodayRoute,
    loadMyTomorrowRoutePreview,
    generateDeliveryRoute,
    loadRoutePlanningDiagnostics,
    updateRouteStatus,
    subscribeToTodayRouteUpdates,
    stopTodayRouteSubscription,
    subscribeToTomorrowPreviewReconnect,
    stopTomorrowPreviewReconnect,
    clearTodayRouteState,
    formatAddress,
    formatStatusHistoryEntry,
    isRouteTemplateInactiveError,
    isDeliveryRouteNotRegenerableError,
    isMissingTemplatePreviewError,
    isMultipleActiveTemplatePreviewError,
    canRegenerateRoute,
    mapGraphQLError,
  }
}

/** Test-only reset for module-level today-route state. */
export function __resetTodayRouteStateForTests(): void {
  myTodayRoute.value = null
  todayRouteSource.value = 'NONE'
  todayRouteCachedAt.value = null
  todayRouteExpiresAt.value = null
  todayRouteErrorCategory.value = null
  todayRouteRefreshError.value = null
  errorMessage.value = null
  statusError.value = null
  loading.value = false
  refreshing.value = false
  updatingStatus.value = false
  todayRouteLoadGeneration += 1
}
