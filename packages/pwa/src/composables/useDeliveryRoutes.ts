import { ref } from 'vue'
import { ApolloError } from '@apollo/client/core'

import {
  BEZORGER_ROUTE_UPDATES_SUBSCRIPTION,
  DELIVERY_ROUTES_QUERY,
  GENERATE_DELIVERY_ROUTE_MUTATION,
  MY_TODAY_ROUTE_QUERY,
  MY_TOMORROW_ROUTE_PREVIEW_QUERY,
  type BezorgerRouteUpdatesSubscription,
  type DeliveryRoutesQuery,
  type DeliveryRoutesQueryVariables,
  type GenerateDeliveryRouteMutation,
  type GenerateDeliveryRouteMutationVariables,
  type MyTodayRouteQuery,
  type MyTomorrowRoutePreviewQuery,
} from '@/assets/graphql/routes'
import { ROUTE_TEMPLATES_QUERY } from '@/assets/graphql/route-templates'
import type { RouteTemplatesQuery } from '@/assets/graphql/route-templates'
import { mapGraphQLError } from '@/composables/useCurrentUser'
import useGraphQL, {
  registerReconnectHandler,
} from '@/composables/useGraphQL'

export type DeliveryRouteItem = NonNullable<
  DeliveryRoutesQuery['deliveryRoutes'][number]
>
export type DeliveryStopItem = DeliveryRouteItem['stops'][number]
export type RoutePreviewItem = MyTomorrowRoutePreviewQuery['myTomorrowRoutePreview']
export type RoutePreviewStopItem = RoutePreviewItem['stops'][number]
export type ActiveRouteTemplateOption =
  RouteTemplatesQuery['routeTemplates'][number]

const deliveryRoutes = ref<DeliveryRouteItem[]>([])
const myTodayRoute = ref<DeliveryRouteItem | null>(null)
const myTomorrowRoutePreview = ref<RoutePreviewItem | null>(null)
const activeTemplates = ref<ActiveRouteTemplateOption[]>([])
const loading = ref(false)
const previewLoading = ref(false)
const templatesLoading = ref(false)
const generating = ref(false)
const errorMessage = ref<string | null>(null)
const previewErrorMessage = ref<string | null>(null)
const previewErrorCode = ref<string | null>(null)
const generateError = ref<string | null>(null)
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
    | { error?: string }
    | undefined

  return originalError?.error ?? null
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

        successMessage.value =
          route.stops.length === 0
            ? 'Route gegenereerd zonder stops (geen kwalificerende bestellingen).'
            : `Route gegenereerd met ${route.stops.length} stop(s).`
      }

      return route
    } catch (error) {
      generateError.value = mapGraphQLError(error)
      return null
    } finally {
      generating.value = false
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

  return {
    deliveryRoutes,
    myTodayRoute,
    myTomorrowRoutePreview,
    activeTemplates,
    loading,
    previewLoading,
    templatesLoading,
    generating,
    errorMessage,
    previewErrorMessage,
    previewErrorCode,
    generateError,
    successMessage,
    loadActiveTemplates,
    loadDeliveryRoutes,
    loadMyTodayRoute,
    loadMyTomorrowRoutePreview,
    generateDeliveryRoute,
    subscribeToTodayRouteUpdates,
    stopTodayRouteSubscription,
    subscribeToTomorrowPreviewReconnect,
    stopTomorrowPreviewReconnect,
    formatAddress,
    isRouteTemplateInactiveError,
    isDeliveryRouteNotRegenerableError,
    isMissingTemplatePreviewError,
    mapGraphQLError,
  }
}
