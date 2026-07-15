import { computed, ref } from 'vue'
import { ApolloError } from '@apollo/client/core'

import {
  ADMIN_ORDER_CREATED_SUBSCRIPTION,
  ADMIN_ORDER_UPDATED_SUBSCRIPTION,
  ORDER_CREATED_SUBSCRIPTION,
  ORDER_UPDATED_SUBSCRIPTION,
  type AdminOrderCreatedSubscription,
  type AdminOrderUpdatedSubscription,
  type OrderCreatedSubscription,
  type OrderUpdatedSubscription,
} from '@/assets/graphql/order.subscription'
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

let myOrderSubscriptionCleanup: (() => void) | null = null
let adminOrderSubscriptionCleanup: (() => void) | null = null

function upsertMyOrder(order: OrderListItem): void {
  const existingIndex = myOrders.value.findIndex(item => item.id === order.id)

  if (existingIndex === -1) {
    myOrders.value = [order, ...myOrders.value]
    return
  }

  myOrders.value = myOrders.value.map(item =>
    item.id === order.id ? { ...item, ...order } : item,
  )
}

function upsertAdminOrder(order: AdminOrderListItem): void {
  const existingIndex = adminOrders.value.findIndex(item => item.id === order.id)

  if (existingIndex === -1) {
    adminOrders.value = [order, ...adminOrders.value]
    return
  }

  adminOrders.value = adminOrders.value.map(item =>
    item.id === order.id ? { ...item, ...order } : item,
  )
}

function orderMatchesAdminFilters(
  order: AdminOrderListItem,
  filters: OrdersQueryVariables,
): boolean {
  if (filters.isoYear !== undefined && order.isoYear !== filters.isoYear) {
    return false
  }

  if (filters.isoWeek !== undefined && order.isoWeek !== filters.isoWeek) {
    return false
  }

  if (filters.status !== undefined && order.status !== filters.status) {
    return false
  }

  if (
    filters.apothekerId !== undefined &&
    order.apotheker.id !== filters.apothekerId
  ) {
    return false
  }

  return true
}

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

  function stopMyOrderSubscriptions(): void {
    myOrderSubscriptionCleanup?.()
    myOrderSubscriptionCleanup = null
  }

  function stopAdminOrderSubscriptions(): void {
    adminOrderSubscriptionCleanup?.()
    adminOrderSubscriptionCleanup = null
  }

  function subscribeToMyOrderEvents(): () => void {
    stopMyOrderSubscriptions()

    const createdSubscription = apolloClient
      .subscribe<OrderCreatedSubscription>({
        query: ORDER_CREATED_SUBSCRIPTION,
      })
      .subscribe({
        next: ({ data }) => {
          const order = data?.orderCreated

          if (order) {
            upsertMyOrder(order)
          }
        },
      })

    const updatedSubscription = apolloClient
      .subscribe<OrderUpdatedSubscription>({
        query: ORDER_UPDATED_SUBSCRIPTION,
      })
      .subscribe({
        next: ({ data }) => {
          const order = data?.orderUpdated

          if (order) {
            upsertMyOrder(order)
          }
        },
      })

    const cleanup = (): void => {
      createdSubscription.unsubscribe()
      updatedSubscription.unsubscribe()
      myOrderSubscriptionCleanup = null
    }

    myOrderSubscriptionCleanup = cleanup

    return cleanup
  }

  function subscribeToAdminOrderEvents(
    filters: OrdersQueryVariables = {},
  ): () => void {
    stopAdminOrderSubscriptions()

    const createdSubscription = apolloClient
      .subscribe<AdminOrderCreatedSubscription>({
        query: ADMIN_ORDER_CREATED_SUBSCRIPTION,
      })
      .subscribe({
        next: ({ data }) => {
          const order = data?.orderCreated

          if (order && orderMatchesAdminFilters(order, filters)) {
            upsertAdminOrder(order)
          }
        },
      })

    const updatedSubscription = apolloClient
      .subscribe<AdminOrderUpdatedSubscription>({
        query: ADMIN_ORDER_UPDATED_SUBSCRIPTION,
      })
      .subscribe({
        next: ({ data }) => {
          const order = data?.orderUpdated

          if (order && orderMatchesAdminFilters(order, filters)) {
            upsertAdminOrder(order)
          }
        },
      })

    const cleanup = (): void => {
      createdSubscription.unsubscribe()
      updatedSubscription.unsubscribe()
      adminOrderSubscriptionCleanup = null
    }

    adminOrderSubscriptionCleanup = cleanup

    return cleanup
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
    subscribeToMyOrderEvents,
    subscribeToAdminOrderEvents,
    stopMyOrderSubscriptions,
    stopAdminOrderSubscriptions,
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
