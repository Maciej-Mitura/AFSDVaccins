import { ref } from 'vue'
import { ApolloError } from '@apollo/client/core'

import {
  BEZORGER_ROUTE_UPDATES_SUBSCRIPTION,
  DELIVERY_ROUTES_QUERY,
  GENERATE_DELIVERY_ROUTE_MUTATION,
  MY_TODAY_ROUTE_QUERY,
  type BezorgerRouteUpdatesSubscription,
  type DeliveryRoutesQuery,
  type DeliveryRoutesQueryVariables,
  type GenerateDeliveryRouteMutation,
  type GenerateDeliveryRouteMutationVariables,
  type MyTodayRouteQuery,
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
export type ActiveRouteTemplateOption =
  RouteTemplatesQuery['routeTemplates'][number]

const deliveryRoutes = ref<DeliveryRouteItem[]>([])
const myTodayRoute = ref<DeliveryRouteItem | null>(null)
const activeTemplates = ref<ActiveRouteTemplateOption[]>([])
const loading = ref(false)
const templatesLoading = ref(false)
const generating = ref(false)
const errorMessage = ref<string | null>(null)
const generateError = ref<string | null>(null)
const successMessage = ref<string | null>(null)

let todayRouteSubscriptionCleanup: (() => void) | null = null
let todayRouteReconnectCleanup: (() => void) | null = null

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
      myTodayRoute.value = result.data.myTodayRoute ?? null
    } catch (error) {
      errorMessage.value = mapGraphQLError(error)
      myTodayRoute.value = null
    } finally {
      loading.value = false
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

  function formatAddress(stop: DeliveryStopItem): string {
    const { address } = stop
    return `${address.street} ${address.houseNumber}, ${address.postalCode} ${address.city}`
  }

  function isRouteTemplateInactiveError(error: unknown): boolean {
    return extractGraphQLErrorCode(error) === 'ROUTE_TEMPLATE_INACTIVE'
  }

  function isDeliveryRouteNotRegenerableError(error: unknown): boolean {
    return extractGraphQLErrorCode(error) === 'DELIVERY_ROUTE_NOT_REGENERABLE'
  }

  return {
    deliveryRoutes,
    myTodayRoute,
    activeTemplates,
    loading,
    templatesLoading,
    generating,
    errorMessage,
    generateError,
    successMessage,
    loadActiveTemplates,
    loadDeliveryRoutes,
    loadMyTodayRoute,
    generateDeliveryRoute,
    subscribeToTodayRouteUpdates,
    stopTodayRouteSubscription,
    formatAddress,
    isRouteTemplateInactiveError,
    isDeliveryRouteNotRegenerableError,
    mapGraphQLError,
  }
}
