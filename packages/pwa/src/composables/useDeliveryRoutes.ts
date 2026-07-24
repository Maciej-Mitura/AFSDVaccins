import { ApolloError } from '@apollo/client/core'
import { RouteStatus } from '@vaccin-delivery/types'
import { ref } from 'vue'

import {
  BEZORGER_ROUTE_UPDATES_SUBSCRIPTION,
  DELIVERY_ROUTES_QUERY,
  GENERATE_DELIVERY_ROUTE_MUTATION,
  MY_TODAY_ROUTE_QUERY,
  MY_TOMORROW_ROUTE_PREVIEW_QUERY,
  UPDATE_ROUTE_STATUS_MUTATION,
  type BezorgerRouteUpdatesSubscription,
  type DeliveryRoutesQuery,
  type DeliveryRoutesQueryVariables,
  type GenerateDeliveryRouteMutation,
  type GenerateDeliveryRouteMutationVariables,
  type MyTodayRouteQuery,
  type MyTomorrowRoutePreviewQuery,
  type UpdateRouteStatusMutation,
  type UpdateRouteStatusMutationVariables,
} from '@/assets/graphql/routes'
import { ROUTE_TEMPLATES_QUERY } from '@/assets/graphql/route-templates'
import type { RouteTemplatesQuery } from '@/assets/graphql/route-templates'
import { mapGraphQLError } from '@/composables/useCurrentUser'
import useGraphQL, { registerReconnectHandler } from '@/composables/useGraphQL'
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
export { RouteStatus }

const deliveryRoutes = ref<DeliveryRouteItem[]>([])
const myTodayRoute = ref<DeliveryRouteItem | null>(null)
const myTomorrowRoutePreview = ref<RoutePreviewItem | null>(null)
const activeTemplates = ref<ActiveRouteTemplateOption[]>([])
const loading = ref(false)
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

let todayRouteSubscriptionCleanup: (() => void) | null = null
let todayRouteReconnectCleanup: (() => void) | null = null
let tomorrowPreviewReconnectCleanup: (() => void) | null = null

function extractGraphQLErrorCode(error: unknown): string | null {
  if (!(error instanceof ApolloError)) {
    return null
  }

  const graphQLError = error.graphQLErrors[0]
  const originalError = graphQLError?.extensions?.originalError as
    { error?: string } | undefined

  return originalError?.error ?? null
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

export function useDeliveryRoutes() {
  const { apolloClient } = useGraphQL()

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

  async function loadMyTodayRoute(): Promise<void> {
    loading.value = true
    errorMessage.value = null

    try {
      const result = await apolloClient.query<MyTodayRouteQuery>({
        query: MY_TODAY_ROUTE_QUERY,
        fetchPolicy: 'network-only',
      })
      // Always replace from network — including null after a real miss —
      // so a stale empty/null cache cannot stay authoritative.
      myTodayRoute.value = result.data.myTodayRoute ?? null
      apolloClient.writeQuery({
        query: MY_TODAY_ROUTE_QUERY,
        data: { myTodayRoute: myTodayRoute.value },
      })
    } catch (error) {
      errorMessage.value = mapGraphQLError(error)
      // Keep any previously loaded route visible on transient refetch errors.
    } finally {
      loading.value = false
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

    try {
      const result = await apolloClient.mutate<
        GenerateDeliveryRouteMutation,
        GenerateDeliveryRouteMutationVariables
      >({
        mutation: GENERATE_DELIVERY_ROUTE_MUTATION,
        variables: { routeTemplateId, deliveryDate },
      })

      const route = result.data?.generateDeliveryRoute ?? null

      if (route) {
        upsertDeliveryRoute(route)

        successMessage.value =
          route.stops.length === 0
            ? translate('success.routes.generatedEmpty')
            : translatePlural(
                'success.routes.generatedStops',
                route.stops.length,
              )
      }

      return route
    } catch (error) {
      generateError.value = mapGraphQLError(error)
      return null
    } finally {
      generating.value = false
    }
  }

  async function updateRouteStatus(
    id: string,
    status: RouteStatusValue,
    reason?: string | null,
  ): Promise<DeliveryRouteItem | null> {
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
          myTodayRoute.value = route
          apolloClient.writeQuery({
            query: MY_TODAY_ROUTE_QUERY,
            data: { myTodayRoute: route },
          })
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
            myTodayRoute.value = route
            apolloClient.writeQuery({
              query: MY_TODAY_ROUTE_QUERY,
              data: { myTodayRoute: route },
            })
          }
        },
      })

    todayRouteReconnectCleanup = registerReconnectHandler(() => {
      void loadMyTodayRoute()
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
      code === 'MULTIPLE_ACTIVE_ROUTE_TEMPLATES' ||
      code === 'BEZORGER_PROFILE_NOT_FOUND'
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
    loadActiveTemplates,
    loadDeliveryRoutes,
    loadMyTodayRoute,
    loadMyTomorrowRoutePreview,
    generateDeliveryRoute,
    updateRouteStatus,
    subscribeToTodayRouteUpdates,
    stopTodayRouteSubscription,
    subscribeToTomorrowPreviewReconnect,
    stopTomorrowPreviewReconnect,
    formatAddress,
    formatStatusHistoryEntry,
    isRouteTemplateInactiveError,
    isDeliveryRouteNotRegenerableError,
    isMissingTemplatePreviewError,
    canRegenerateRoute,
    mapGraphQLError,
  }
}
