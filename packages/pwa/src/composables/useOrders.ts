import { computed, ref } from 'vue'
import { ApolloError } from '@apollo/client/core'

import {
  CANCEL_OWN_ORDER_MUTATION,
  CREATE_ORDER_MUTATION,
  MY_ORDERS_QUERY,
  MY_WEEKLY_ORDER_SUMMARY_QUERY,
  ORDERS_QUERY,
  type CancelOwnOrderMutation,
  type CreateOrderMutation,
  type CreateOrderMutationVariables,
  type MyOrdersQuery,
  type MyWeeklyOrderSummaryQuery,
  type OrdersQuery,
  type OrdersQueryVariables,
} from '@/assets/graphql/order'
import { mapGraphQLError } from '@/composables/useCurrentUser'
import useGraphQL from '@/composables/useGraphQL'

export type OrderListItem = MyOrdersQuery['myOrders'][number]
export type AdminOrderListItem = OrdersQuery['orders'][number]
export type WeeklyOrderSummary = MyWeeklyOrderSummaryQuery['myWeeklyOrderSummary']

const myOrders = ref<OrderListItem[]>([])
const adminOrders = ref<AdminOrderListItem[]>([])
const weeklySummary = ref<WeeklyOrderSummary | null>(null)
const loading = ref(false)
const errorMessage = ref<string | null>(null)

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

export function useOrders() {
  const { apolloClient } = useGraphQL()

  const hasWeeklyWarning = computed(
    () => weeklySummary.value?.warningReached ?? false,
  )

  async function loadMyOrders(
    isoYear?: number,
    isoWeek?: number,
  ): Promise<void> {
    loading.value = true
    errorMessage.value = null

    try {
      const result = await apolloClient.query<MyOrdersQuery>({
        query: MY_ORDERS_QUERY,
        variables: { isoYear, isoWeek },
        fetchPolicy: 'network-only',
      })

      myOrders.value = result.data.myOrders
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function loadWeeklySummary(
    isoYear?: number,
    isoWeek?: number,
  ): Promise<WeeklyOrderSummary> {
    loading.value = true
    errorMessage.value = null

    try {
      const result = await apolloClient.query<MyWeeklyOrderSummaryQuery>({
        query: MY_WEEKLY_ORDER_SUMMARY_QUERY,
        variables: { isoYear, isoWeek },
        fetchPolicy: 'network-only',
      })

      weeklySummary.value = result.data.myWeeklyOrderSummary
      return result.data.myWeeklyOrderSummary
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function createOrder(
    input: CreateOrderMutationVariables['input'],
  ): Promise<OrderListItem> {
    loading.value = true
    errorMessage.value = null

    try {
      const result = await apolloClient.mutate<CreateOrderMutation>({
        mutation: CREATE_ORDER_MUTATION,
        variables: { input },
      })

      if (!result.data?.createOrder) {
        throw new Error('Kon de bestelling niet plaatsen.')
      }

      const created = result.data.createOrder
      myOrders.value = [created, ...myOrders.value]
      await loadWeeklySummary(created.isoYear, created.isoWeek)
      return created
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function cancelOwnOrder(id: string): Promise<OrderListItem> {
    loading.value = true
    errorMessage.value = null

    try {
      const result = await apolloClient.mutate<CancelOwnOrderMutation>({
        mutation: CANCEL_OWN_ORDER_MUTATION,
        variables: { id },
      })

      if (!result.data?.cancelOwnOrder) {
        throw new Error('Kon de bestelling niet annuleren.')
      }

      const cancelled = result.data.cancelOwnOrder
      myOrders.value = myOrders.value.map(order =>
        order.id === id ? { ...order, ...cancelled } : order,
      )

      const currentOrder = myOrders.value.find(order => order.id === id)
      if (currentOrder) {
        await loadWeeklySummary(currentOrder.isoYear, currentOrder.isoWeek)
      }

      return myOrders.value.find(order => order.id === id)!
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function loadAdminOrders(
    variables: OrdersQueryVariables = {},
  ): Promise<void> {
    loading.value = true
    errorMessage.value = null

    try {
      const result = await apolloClient.query<OrdersQuery>({
        query: ORDERS_QUERY,
        variables,
        fetchPolicy: 'network-only',
      })

      adminOrders.value = result.data.orders
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    } finally {
      loading.value = false
    }
  }

  function isOrderCannotBeCancelledError(error: unknown): boolean {
    return extractGraphQLErrorCode(error) === 'ORDER_CANNOT_BE_CANCELLED'
  }

  return {
    myOrders,
    adminOrders,
    weeklySummary,
    loading,
    errorMessage,
    hasWeeklyWarning,
    loadMyOrders,
    loadWeeklySummary,
    createOrder,
    cancelOwnOrder,
    loadAdminOrders,
    isWeeklyLimitExceededError,
    isDailyLimitExceededError,
    isVaccineInactiveError,
    isOrderCannotBeCancelledError,
    mapGraphQLError,
  }
}

function isWeeklyLimitExceededError(error: unknown): boolean {
  return extractGraphQLErrorCode(error) === 'WEEKLY_LIMIT_EXCEEDED'
}

function isDailyLimitExceededError(error: unknown): boolean {
  return extractGraphQLErrorCode(error) === 'DAILY_LIMIT_EXCEEDED'
}

function isVaccineInactiveError(error: unknown): boolean {
  return extractGraphQLErrorCode(error) === 'VACCINE_INACTIVE'
}
